import { z } from 'zod';
import type { Tool } from './types.js';

interface DocFixture {
  id: string;
  title: string;
  body: string;
}

const FIXTURES: DocFixture[] = [
  {
    id: 'tinybus-design',
    title: 'tinybus: at-least-once Postgres queue',
    body: `tinybus uses FOR UPDATE SKIP LOCKED to claim jobs atomically across worker processes.
Each claim takes a lease (visibility window). A sweeper recovers expired leases.
Failed jobs are retried with exponential backoff and jitter; permanent failures land in a DLQ table.`,
  },
  {
    id: 'collab-board-design',
    title: 'collab-board: WebSocket fan-out with backpressure',
    body: `collab-board uses one goroutine per room as the single writer.
Each connection has a bounded send channel (capacity 64). Sending is non-blocking via select+default.
Slow clients are evicted instead of blocking the room — producers keep moving.`,
  },
  {
    id: 'prompt-caching',
    title: 'Prompt caching with cache_control',
    body: `Anthropic's prompt cache reuses prefix tokens across requests for ~90% input cost reduction.
Mark stable prefix blocks (system prompt, tool definitions, large reference documents) with cache_control: { type: 'ephemeral' }.
Cache TTL is approximately 5 minutes. Avoid caching content that changes per request.`,
  },
];

const InputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(10).default(3),
});

export const searchDocsTool: Tool<z.infer<typeof InputSchema>, { results: DocFixture[] }> = {
  name: 'search_docs',
  description:
    'Search a small local knowledge base of design notes (tinybus, collab-board, prompt caching). Returns matching documents.',
  inputSchema: InputSchema,
  definition: {
    name: 'search_docs',
    description:
      'Search internal design notes about backend systems (tinybus job queue, collab-board WebSocket server, prompt caching). Returns matching documents with title and body.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query.' },
        limit: { type: 'number', description: 'Max results to return (default 3).' },
      },
      required: ['query'],
    },
  },

  async execute(input, ctx) {
    const { query, limit } = input;
    const needle = query.toLowerCase();
    const scored = FIXTURES.map((doc) => {
      const haystack = (doc.title + ' ' + doc.body).toLowerCase();
      const score = needle
        .split(/\s+/)
        .filter(Boolean)
        .reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
      return { doc, score };
    });
    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.doc);

    ctx.log('tool.search_docs.ok', { query, hits: results.length });
    return { results };
  },
};
