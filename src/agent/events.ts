import type Anthropic from '@anthropic-ai/sdk';

export type AgentEvent =
  | { type: 'iteration_start'; iteration: number }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; tool: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; ok: boolean; output: unknown }
  | { type: 'usage'; usage: Anthropic.Usage }
  | { type: 'done'; stopReason: Anthropic.StopReason | 'max_iterations' }
  | { type: 'error'; message: string };
