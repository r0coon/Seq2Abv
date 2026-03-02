import { getDb } from './index';

export interface BlacklistRow {
  id:         number;
  user_id:    string;
  reason:     string;
  expires_at: Date | null;
  created_by: string;
  created_at: Date;
}

const db = () => getDb();

export async function addBlacklist(data: { userId: string; reason: string; expiresAt: Date | null; createdBy: string }): Promise<void> {
  await db().query('DELETE FROM blacklist WHERE user_id = $1', [data.userId]);
  await db().query(
    'INSERT INTO blacklist (user_id, reason, expires_at, created_by) VALUES ($1, $2, $3, $4)',
    [data.userId, data.reason, data.expiresAt, data.createdBy],
  );
}

export async function removeBlacklist(userId: string): Promise<boolean> {
  const { rowCount } = await db().query('DELETE FROM blacklist WHERE user_id = $1', [userId]);
  return (rowCount ?? 0) > 0;
}

export async function getActiveBlacklist(userId: string): Promise<BlacklistRow | null> {
  // abgelaufene einträge direkt cleanen
  await db().query('DELETE FROM blacklist WHERE user_id = $1 AND expires_at IS NOT NULL AND expires_at < NOW()', [userId]);
  const { rows } = await db().query<BlacklistRow>('SELECT * FROM blacklist WHERE user_id = $1 LIMIT 1', [userId]);
  return rows[0] ?? null;
}

export async function getAllTimedBlacklist(): Promise<BlacklistRow[]> {
  const { rows } = await db().query<BlacklistRow>('SELECT * FROM blacklist WHERE expires_at IS NOT NULL AND expires_at > NOW()');
  return rows;
}

export async function purgeExpiredBlacklist(): Promise<number> {
  const { rowCount } = await db().query('DELETE FROM blacklist WHERE expires_at IS NOT NULL AND expires_at < NOW()');
  return rowCount ?? 0;
}
