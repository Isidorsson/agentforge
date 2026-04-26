import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export interface ToolContext {
  signal?: AbortSignal;
  /** Per-request log fields for tracing tool calls */
  log: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Type-erased shape stored in the registry. The agent loop calls
 * `inputSchema.safeParse(unknownFromModel)` and then `execute(parsed)` —
 * neither side needs static typing on `I`. Authors should use `defineTool`
 * below to get type-safe `execute` parameters during implementation.
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  definition: Anthropic.Tool;
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Helper that ties a Zod schema to a typed `execute` and returns a
 * type-erased `Tool` for the registry. Inside `execute`, `input` is
 * `z.infer<typeof schema>` — fully typed, no casts.
 */
export function defineTool<S extends z.ZodTypeAny, O>(opts: {
  name: string;
  description: string;
  inputSchema: S;
  definition: Anthropic.Tool;
  execute: (input: z.infer<S>, ctx: ToolContext) => Promise<O>;
}): Tool {
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    definition: opts.definition,
    execute: (input, ctx) => opts.execute(input as z.infer<S>, ctx),
  };
}
