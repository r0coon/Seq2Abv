import { Pool } from 'pg';
import logger   from '../utils/logging';

const FILE = '@src/database/index.ts';

let pool: Pool | null = null;

function pgConfig(database: string) {
  return {
    host:     process.env.PG_HOST     ?? 'localhost',
    port:     Number(process.env.PG_PORT ?? 5432),
    user:     process.env.PG_USER     ?? 'postgres',
    password: process.env.PG_PASSWORD ?? '',
    database,
  };
}

async function ensureDatabase(guildId: string): Promise<void> {
  const admin = new Pool(pgConfig('postgres'));
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [guildId]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${guildId}"`);
      logger.info(`Database "${guildId}" created.`, FILE);
    }
  } finally {
    await admin.end();
  }
}

async function runMigrations(p: Pool): Promise<void> {
  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id                 SERIAL      PRIMARY KEY,
        channel_id         BIGINT,
        category_id        VARCHAR(50) NOT NULL,
        created_by         BIGINT      NOT NULL,
        created_at         TIMESTAMP   NOT NULL DEFAULT NOW(),
        closed_by          BIGINT,
        closed_at          TIMESTAMP,
        close_reason       TEXT,
        transcript_enabled BOOLEAN     NOT NULL DEFAULT TRUE
      )
    `);

    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transcript_enabled BOOLEAN NOT NULL DEFAULT TRUE`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id         SERIAL    PRIMARY KEY,
        user_id    BIGINT    NOT NULL,
        reason     TEXT      NOT NULL,
        expires_at TIMESTAMP,
        created_by BIGINT    NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  const guildId = process.env.GUILD_ID;
  if (!guildId) throw new Error('GUILD_ID nicht gesetzt');

  await ensureDatabase(guildId);
  pool = new Pool(pgConfig(guildId));
  await runMigrations(pool);

}

export function getDb(): Pool {
  if (!pool) throw new Error('DB nicht initialisiert — initDb() aufrufen');
  return pool;
}
