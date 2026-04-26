import { z } from 'zod';
import { defineTool } from './types.js';

const InputSchema = z.object({
  url: z.string().url(),
  max_bytes: z.number().int().positive().max(1_000_000).default(50_000),
});

const PRIVATE_HOST_PREFIXES = ['10.', '127.', '192.168.', '172.16.', '169.254.', 'localhost'];

export const fetchUrlTool = defineTool({
  name: 'fetch_url',
  description:
    'Fetch a public HTTP(S) URL and return its body as text (truncated to max_bytes). Refuses to fetch private/loopback addresses.',
  inputSchema: InputSchema,
  definition: {
    name: 'fetch_url',
    description:
      'Fetch a public HTTP(S) URL and return its body as text. Use this to retrieve documentation pages, articles, or API responses the user references.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
        max_bytes: {
          type: 'number',
          description: 'Maximum response body size in bytes (default 50000, max 1000000).',
        },
      },
      required: ['url'],
    },
  },

  async execute(input, ctx): Promise<{ status: number; body: string }> {
    const { url, max_bytes } = input;
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`);
    }
    if (PRIVATE_HOST_PREFIXES.some((p) => parsed.hostname.startsWith(p))) {
      throw new Error(`refusing to fetch private host: ${parsed.hostname}`);
    }

    ctx.log('tool.fetch_url.request', { host: parsed.hostname });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    ctx.signal?.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'agentforge/0.1' },
      });
      const reader = res.body?.getReader();
      if (!reader) return { status: res.status, body: '' };

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < max_bytes) {
        const { value, done } = await reader.read();
        if (done) break;
        const remaining = max_bytes - total;
        const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
        chunks.push(slice);
        total += slice.byteLength;
        if (slice !== value) {
          await reader.cancel();
          break;
        }
      }

      const body = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
      ctx.log('tool.fetch_url.ok', { status: res.status, bytes: total });
      return { status: res.status, body };
    } finally {
      clearTimeout(timeout);
    }
  },
});

export type FetchUrlInput = z.infer<typeof InputSchema>;
