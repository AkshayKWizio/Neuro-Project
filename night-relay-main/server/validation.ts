import type { RunResult } from '../src/shared/leaderboard.ts';
import { isRecord } from '../src/shared/leaderboard.js';
import { ROUTE_MAX_COINS_PER_ROW, ROUTE_MIN_GAP } from '../src/game/rules.js';

export class RequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const COUNTRY_CODES = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(
    ' ',
  ),
);

/** ISO 3166-1 alpha-2 only. Unknown, proxy and regional placeholders are excluded. */
export function readCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase();
  return COUNTRY_CODES.has(code) ? code : null;
}

export function readRunId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
  ) {
    throw new RequestError(400, 'Run session is missing.');
  }
  return value;
}

/** Cumulative active time, rounded down so retries cannot accumulate rounding errors. */
export function readRunSeconds(value: unknown, elapsedSeconds?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86_400) {
    throw new RequestError(400, 'Run time is invalid.');
  }
  if (
    elapsedSeconds !== undefined &&
    (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || value > elapsedSeconds + 3)
  ) {
    throw new RequestError(400, 'This run time could not be verified.');
  }
  return Math.floor(value * 1000) / 1000;
}

export function readNickname(value: unknown): string {
  if (typeof value !== 'string') throw new RequestError(400, 'Choose a name with 3–20 characters.');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N} _.'-]{3,20}$/u.test(name)) {
    throw new RequestError(400, 'Use 3–20 letters, numbers, spaces, or simple punctuation.');
  }
  return name;
}

function readNonnegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RequestError(400, 'Run details are invalid.');
  }
  return value;
}

export function readRequestBody(value: unknown): Record<string, unknown> {
  let body: unknown = value;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > 4096)
      throw new RequestError(413, 'This request is too large.');
    try {
      body = JSON.parse(value);
    } catch {
      throw new RequestError(400, 'This request is invalid.');
    }
  }
  if (!isRecord(body)) throw new RequestError(400, 'This request is invalid.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 4096)
    throw new RequestError(413, 'This request is too large.');
  return body;
}

/** Broad plausibility checks, not an authoritative replay of the browser simulation. */
export function readRunResult(value: unknown, elapsedSeconds: number): RunResult {
  if (!isRecord(value)) throw new RequestError(400, 'Run details are missing.');
  const result: RunResult = {
    score: readNonnegativeNumber(value.score),
    distance: readNonnegativeNumber(value.distance),
    coins: readNonnegativeNumber(value.coins),
    runSeconds: readNonnegativeNumber(value.runSeconds),
    peakFlow: readNonnegativeNumber(value.peakFlow),
    nearMisses: readNonnegativeNumber(value.nearMisses),
    cleanMoves: readNonnegativeNumber(value.cleanMoves),
  };
  for (const key of ['score', 'coins', 'peakFlow', 'nearMisses', 'cleanMoves'] as const) {
    if (!Number.isSafeInteger(result[key])) throw new RequestError(400, 'Run details are invalid.');
  }
  const { score, distance, coins, runSeconds, peakFlow, nearMisses, cleanMoves } = result;
  readRunSeconds(runSeconds, elapsedSeconds);
  if (runSeconds <= 0 || distance < 1 || peakFlow < 1 || peakFlow > 4) {
    throw new RequestError(400, 'This run could not be verified.');
  }
  const accelerationTime = Math.log(26 / 14) / 0.0075;
  const maximumDistance =
    runSeconds <= accelerationTime
      ? (14 * Math.expm1(0.0075 * runSeconds)) / 0.0075
      : 1600 + (runSeconds - accelerationTime) * 26;
  if (distance > maximumDistance + 8 || distance < maximumDistance - 12) {
    throw new RequestError(400, 'The run time and distance do not match.');
  }
  // The new route has gaps down to 24m; the earlier route could place three obstacles.
  const coinLimit = 15 + Math.ceil(distance / ROUTE_MIN_GAP) * ROUTE_MAX_COINS_PER_ROW;
  const obstacleLimit = 4 + Math.ceil(distance / ROUTE_MIN_GAP) * 3;
  const neededCoins = peakFlow === 4 ? 50 : peakFlow === 3 ? 25 : peakFlow === 2 ? 10 : 0;
  if (coins > coinLimit || coins < neededCoins || nearMisses + cleanMoves > obstacleLimit) {
    throw new RequestError(400, 'The run pickups do not match the route.');
  }
  const base = distance * 10;
  const rewards = coins * 50 + nearMisses * 150 + cleanMoves * 100;
  if (score < Math.floor(base + rewards) - 2 || score > Math.ceil(base + rewards * peakFlow) + 2) {
    throw new RequestError(400, 'The score does not match this run.');
  }
  return result;
}
