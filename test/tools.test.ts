import { describe, it, expect } from 'vitest';
import { fetchUrlTool } from '../src/agent/tools/fetch_url.js';
import { searchDocsTool } from '../src/agent/tools/search_docs.js';

const ctx = { log: () => undefined };

interface SearchResult {
  results: Array<{ id: string; title: string; body: string }>;
}

describe('search_docs tool', () => {
  it('finds tinybus design notes by keyword', async () => {
    const result = (await searchDocsTool.execute(
      { query: 'tinybus skip locked', limit: 3 },
      ctx,
    )) as SearchResult;
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.id).toBe('tinybus-design');
  });

  it('returns empty results for unrelated query', async () => {
    const result = (await searchDocsTool.execute(
      { query: 'kubernetes helm chart', limit: 3 },
      ctx,
    )) as SearchResult;
    expect(result.results).toHaveLength(0);
  });

  it('rejects oversized limit via schema', () => {
    const parsed = searchDocsTool.inputSchema.safeParse({ query: 'x', limit: 999 });
    expect(parsed.success).toBe(false);
  });
});

describe('fetch_url tool', () => {
  it('rejects private IPs', async () => {
    await expect(
      fetchUrlTool.execute({ url: 'http://127.0.0.1/admin', max_bytes: 1000 }, ctx),
    ).rejects.toThrow(/private host/);
  });

  it('rejects file:// protocol via schema', () => {
    const parsed = fetchUrlTool.inputSchema.safeParse({
      url: 'file:///etc/passwd',
      max_bytes: 1000,
    });
    if (parsed.success) {
      return expect(fetchUrlTool.execute(parsed.data, ctx)).rejects.toThrow(/unsupported protocol/);
    }
    expect(parsed.success).toBe(false);
  });
});
