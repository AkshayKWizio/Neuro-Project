import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';
import handler, { type LeaderboardHttpResponse } from '../api/leaderboard.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });

/** Match the production response methods using Node's HTTP server. */
function apiResponse(response: ServerResponse): LeaderboardHttpResponse {
  const adapter: LeaderboardHttpResponse = {
    setHeader(name, value): void {
      response.setHeader(name, value);
    },
    status(code): LeaderboardHttpResponse {
      response.statusCode = code;
      return adapter;
    },
    json(body): void {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(body));
    },
  };
  return adapter;
}

async function serveLeaderboard(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const reply = apiResponse(response);
  try {
    request.setEncoding('utf8');
    let body = '';
    for await (const chunk of request) {
      if (typeof chunk !== 'string') throw new Error('Unexpected HTTP body encoding.');
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > 4096) {
        reply.status(413).json({ error: 'This request is too large.' });
        return;
      }
    }
    await handler(
      { method: request.method, headers: request.headers, body: body || undefined },
      reply,
    );
  } catch {
    if (!response.writableEnded)
      reply.status(500).json({ error: 'The local API could not complete this request.' });
  }
}

const server = createServer((request, response): void => {
  if (request.url?.split('?')[0] === '/api/leaderboard') {
    void serveLeaderboard(request, response);
  } else {
    vite.middlewares(request, response);
  }
});

server.listen(port, '127.0.0.1', (): void => {
  console.log(`Night Relay + local API: http://localhost:${port}`);
  if (!process.env.DATABASE_URL)
    console.log('No DATABASE_URL configured. Gameplay works; shared rankings are unavailable.');
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  server.close();
  await vite.close();
}
process.once('SIGINT', (): void => {
  void stop();
});
process.once('SIGTERM', (): void => {
  void stop();
});
