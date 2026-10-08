import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const connectionUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;
if (!connectionUrl) throw new Error('Set a direct DATABASE_URL_UNPOOLED connection in .env.local.');
if (new URL(connectionUrl).hostname.includes('-pooler.'))
  throw new Error('Use DATABASE_URL_UNPOOLED for migrations, not the pooled application URL.');
const sql = neon(connectionUrl);
const schema = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
await sql.transaction(
  schema
    .split(';')
    .filter((part) => part.trim())
    .map((statement) => sql.query(statement)),
);
console.log(
  'Night Relay leaderboard schema is ready. Existing scores and lifetime tracking were preserved.',
);
