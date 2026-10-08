import type { IncomingHttpHeaders } from 'node:http';
import {
  ensurePlayer,
  getLeaderboard,
  limitRequests,
  recordProgress,
  renamePlayer,
  startRun,
  submitRun,
  tokenHash,
} from '../server/database.js';
import { RequestError, readCountryCode, readRequestBody } from '../server/validation.js';

/** The HTTP fields shared by Vercel's Node handler and the local development adapter. */
export interface LeaderboardHttpRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface LeaderboardHttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): LeaderboardHttpResponse;
  json(body: unknown): void;
}

/** Public standings plus browser-owned profiles and one-use run sessions. */
export default async function handler(
  req: LeaderboardHttpRequest,
  res: LeaderboardHttpResponse,
): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!['GET', 'POST'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, POST');
      throw new RequestError(405, 'This method is not supported.');
    }
    if (Number(req.headers['content-length'] ?? 0) > 4096)
      throw new RequestError(413, 'This request is too large.');
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const hash = token ? tokenHash(token) : null;
    const address = (
      String(req.headers['x-forwarded-for'] ?? 'local').split(',')[0] ?? 'local'
    ).trim();
    await limitRequests(`request:${address}`, 120);
    if (req.method === 'GET') {
      res.status(200).json(await getLeaderboard(hash));
      return;
    }
    if (!hash) throw new RequestError(401, 'Your browser identity is missing.');
    const body = readRequestBody(req.body);
    await limitRequests(`write:${hash}`, 30);
    // Vercel supplies geolocation at its edge. Never accept a country from the request body.
    const country =
      process.env.VERCEL === '1' ? readCountryCode(req.headers['x-vercel-ip-country']) : null;
    if (body.action === 'profile') {
      await ensurePlayer(hash);
      res.status(200).json(await getLeaderboard(hash));
    } else if (body.action === 'rename') {
      res.status(200).json(await renamePlayer(hash, body.nickname));
    } else if (body.action === 'start') {
      await limitRequests(`start:${hash}`, 12);
      res.status(201).json(await startRun(hash));
    } else if (body.action === 'finish') {
      res.status(200).json(await submitRun(hash, body.runId, body.result, country));
    } else if (body.action === 'progress') {
      res.status(200).json(await recordProgress(hash, body.runId, body.runSeconds, country));
    } else throw new RequestError(400, 'Unknown leaderboard action.');
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.status === 429) res.setHeader('Retry-After', '60');
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof SyntaxError)
      res.status(400).json({ error: 'This request is invalid.' });
    else {
      console.error(
        'Leaderboard request failed',
        error instanceof Error ? error.name : 'Unknown error',
      );
      res.status(503).json({ error: 'The leaderboard is taking a breather. Please try again.' });
    }
  }
}
