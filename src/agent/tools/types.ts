import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  /** Anthropic tool definition (input_schema must be JSON Schema, not Zod) */
  definition: Anthropic.Tool;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface ToolContext {
  signal?: AbortSignal;
  /** Per-request log fields for tracing tool calls */
  log: (event: string, data?: Record<string, unknown>) => void;
}
