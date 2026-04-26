import type Anthropic from '@anthropic-ai/sdk';
import type { Pool } from './pool.js';

export interface SessionRow {
  id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: Anthropic.MessageParam['content'];
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: Date;
}

export async function createSession(pool: Pool, title?: string): Promise<SessionRow> {
  const { rows } = await pool.query<SessionRow>(
    'INSERT INTO sessions(title) VALUES ($1) RETURNING *',
    [title ?? null],
  );
  if (rows.length === 0) throw new Error('failed to create session');
  return rows[0]!;
}

export async function getSession(pool: Pool, id: string): Promise<SessionRow | null> {
  const { rows } = await pool.query<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listMessages(pool: Pool, sessionId: string): Promise<MessageRow[]> {
  const { rows } = await pool.query<MessageRow>(
    'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
    [sessionId],
  );
  return rows;
}

export async function appendMessage(
  pool: Pool,
  sessionId: string,
  role: MessageRow['role'],
  content: Anthropic.MessageParam['content'],
  tokensIn?: number,
  tokensOut?: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO messages(session_id, role, content, tokens_in, tokens_out)
     VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [sessionId, role, JSON.stringify(content), tokensIn ?? null, tokensOut ?? null],
  );
  await pool.query('UPDATE sessions SET updated_at = now() WHERE id = $1', [sessionId]);
}

export function rowsToMessageParams(rows: MessageRow[]): Anthropic.MessageParam[] {
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}
