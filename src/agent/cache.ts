import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS } from './tools/registry.js';

export const SYSTEM_PROMPT = `You are agentforge, a backend-savvy assistant.
You can call tools to fetch URLs and search a local knowledge base of design notes.
Reply concisely. When the user asks about a design idea, prefer search_docs first; only use fetch_url for explicitly-provided URLs.
Cite sources by document id or URL when you use tool results.`;

// ─────────────────────────────────────────────────────────────────────────────
// TODO(andreas): Tune the prompt-cache strategy.
//
// Anthropic's prompt cache reuses prefix tokens across requests with a ~5-minute
// TTL. Marking blocks with `cache_control: { type: 'ephemeral' }` is roughly a
// 90% input-cost discount on cache hits — but only if the cached prefix is byte-
// identical across requests.
//
// Decisions worth making explicit (5–10 lines below):
//
//   1. Should TOOL_DEFINITIONS be cached? Pros: tool list is large (~hundreds
//      of tokens) and stable. Cons: any tool description edit invalidates the
//      cache for everyone for ~5 min. Trade-off: edit cadence vs. hit rate.
//
//   2. Should the system prompt be cached? Same trade-off — but the system
//      prompt almost never changes mid-deploy, so this is usually a yes.
//
//   3. Should you cache long historical messages within a session? Yes once a
//      session has 5+ messages: append a cache_control to the last assistant
//      turn so subsequent loop iterations reuse the prefix.
//
// Cache hits/misses are reported by the API in `usage.cache_read_input_tokens`
// and `usage.cache_creation_input_tokens` — wire these into obs/metrics.ts so
// you can graph hit rate.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function buildToolDefinitions(): Anthropic.Tool[] {
  // Cache the tool definitions on the last entry so the whole array is part
  // of the cached prefix.
  if (TOOL_DEFINITIONS.length === 0) return [];
  return TOOL_DEFINITIONS.map((tool, i) => {
    if (i !== TOOL_DEFINITIONS.length - 1) return tool;
    return { ...tool, cache_control: { type: 'ephemeral' } };
  });
}
