import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'agentforge_http_requests_total',
  help: 'HTTP requests by route, method, and status',
  labelNames: ['route', 'method', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'agentforge_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ─────────────────────────────────────────────────────────────────────────────
// TODO(andreas): Define the agent-loop metrics that matter most for production
// debugging. tinybus's lesson: a handful of well-chosen series beats dozens of
// noisy ones. Suggestions to consider — pick what helps you debug bad runs:
//
//   - agent_iterations_total{outcome=completed|max_reached|error}
//   - agent_iteration_duration_seconds (histogram)
//   - agent_tool_calls_total{tool, outcome}
//   - agent_cache_reads_total{result=hit|miss}
//   - agent_input_tokens_total / agent_output_tokens_total
//
// Pick 3–5. Export them from this file, increment them inside agent/loop.ts
// and agent/cache.ts. Keep label cardinality bounded (no user IDs, no free
// text — only enums you control).
// ─────────────────────────────────────────────────────────────────────────────
