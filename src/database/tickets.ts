import { getDb } from './index';

export interface TicketRow {
  id:                 number;
  channel_id:         string | null;
  category_id:        string;
  created_by:         string;
  created_at:         Date;
  closed_by:          string | null;
  closed_at:          Date | null;
  close_reason:       string | null;
  transcript_enabled: boolean;
}

const db = () => getDb();

export async function insertTicket(data: { categoryId: string; createdBy: string }): Promise<number> {
  const { rows } = await db().query<{ id: number }>(
    'INSERT INTO tickets (category_id, created_by) VALUES ($1, $2) RETURNING id',
    [data.categoryId, data.createdBy],
  );
  return rows[0].id;
}

export async function setTicketChannel(id: number, channelId: string): Promise<void> {
  await db().query('UPDATE tickets SET channel_id = $1 WHERE id = $2', [channelId, id]);
}

export async function closeTicket(data: { channelId: string; closedBy: string; closeReason?: string }): Promise<void> {
  await db().query(
    'UPDATE tickets SET closed_by = $1, closed_at = NOW(), close_reason = $2 WHERE channel_id = $3 AND closed_at IS NULL',
    [data.closedBy, data.closeReason ?? null, data.channelId],
  );
}

export async function getTicketByChannel(channelId: string): Promise<TicketRow | null> {
  const { rows } = await db().query<TicketRow>('SELECT * FROM tickets WHERE channel_id = $1 LIMIT 1', [channelId]);
  return rows[0] ?? null;
}

export async function updateTicketCategory(channelId: string, categoryId: string): Promise<void> {
  await db().query('UPDATE tickets SET category_id = $1 WHERE channel_id = $2', [categoryId, channelId]);
}

export async function toggleTranscript(channelId: string): Promise<boolean> {
  const { rows } = await db().query<{ transcript_enabled: boolean }>(
    'UPDATE tickets SET transcript_enabled = NOT transcript_enabled WHERE channel_id = $1 RETURNING transcript_enabled',
    [channelId],
  );
  return rows[0]?.transcript_enabled ?? true;
}

export async function getTicketsByUser(userId: string, limit = 25): Promise<TicketRow[]> {
  const { rows } = await db().query<TicketRow>(
    'SELECT * FROM tickets WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return rows;
}

export async function countOpenTicketsByUser(data: { userId: string; categoryId: string }): Promise<number> {
  const { rows } = await db().query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM tickets WHERE created_by = $1 AND category_id = $2 AND closed_at IS NULL',
    [data.userId, data.categoryId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}
