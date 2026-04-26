import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent } from './events.js';
import { buildSystemBlocks, buildToolDefinitions } from './cache.js';
import { TOOLS_BY_NAME } from './tools/registry.js';
import type { ToolContext } from './tools/types.js';

export interface AgentRunOptions {
  anthropic: Anthropic;
  model: string;
  maxIterations: number;
  messages: Anthropic.MessageParam[];
  signal?: AbortSignal;
  log: (event: string, data?: Record<string, unknown>) => void;
}

interface ToolExecution {
  block: Anthropic.ToolUseBlock;
  result: { ok: boolean; output: unknown };
}

export async function* runAgent(opts: AgentRunOptions): AsyncGenerator<AgentEvent, void, void> {
  const messages = [...opts.messages];

  for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
    yield { type: 'iteration_start', iteration };

    const stream = opts.anthropic.messages.stream(
      {
        model: opts.model,
        max_tokens: 4096,
        system: buildSystemBlocks(),
        tools: buildToolDefinitions(),
        messages,
      },
      { signal: opts.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield { type: 'usage', usage: final.usage };

    if (final.stop_reason !== 'tool_use') {
      yield { type: 'done', stopReason: final.stop_reason ?? 'end_turn' };
      return;
    }

    const toolUses = final.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    const executions = await runToolUses(toolUses, {
      signal: opts.signal,
      log: opts.log,
    });

    for (const exec of executions) {
      yield {
        type: 'tool_call',
        tool: exec.block.name,
        toolUseId: exec.block.id,
        input: exec.block.input,
      };
      yield {
        type: 'tool_result',
        toolUseId: exec.block.id,
        ok: exec.result.ok,
        output: exec.result.output,
      };
    }

    messages.push({ role: 'assistant', content: final.content });
    messages.push({
      role: 'user',
      content: executions.map<Anthropic.ToolResultBlockParam>((exec) => ({
        type: 'tool_result',
        tool_use_id: exec.block.id,
        is_error: !exec.result.ok,
        content: JSON.stringify(exec.result.output),
      })),
    });
  }

  yield { type: 'done', stopReason: 'max_iterations' };
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO(andreas): Tool-execution policy.
//
// Current behavior is SEQUENTIAL: tools run one after another in declaration
// order. That's the safest default — order is deterministic, errors don't
// race, and you can read the trace top-to-bottom.
//
// Try (5–10 lines) the parallel version with `Promise.all`:
//   - Pro: fewer wall-clock seconds when the model issues 2+ independent calls
//     (e.g. fetch_url for two URLs).
//   - Con: harder to debug when one fails; total token spend the same.
//
// Decisions worth making explicit while you're in here:
//   - On hallucinated tool name: currently returns a structured error to the
//     model. Alternatives: throw (abort the loop) or log+drop (ignore silently).
//     Returning the error is usually right — Claude self-corrects on next turn.
//   - On tool exception: same — currently captured as { ok: false }.
//   - Per-tool timeout: not enforced here. fetch_url has its own 10s timeout.
//     Consider a global ceiling on the loop in case a tool hangs.
// ─────────────────────────────────────────────────────────────────────────────
async function runToolUses(
  toolUses: Anthropic.ToolUseBlock[],
  ctx: ToolContext,
): Promise<ToolExecution[]> {
  const out: ToolExecution[] = [];
  for (const block of toolUses) {
    out.push({ block, result: await executeOne(block, ctx) });
  }
  return out;
}

async function executeOne(
  block: Anthropic.ToolUseBlock,
  ctx: ToolContext,
): Promise<{ ok: boolean; output: unknown }> {
  const tool = TOOLS_BY_NAME.get(block.name);
  if (!tool) {
    ctx.log('tool.unknown', { name: block.name });
    return {
      ok: false,
      output: { error: 'unknown_tool', message: `Tool "${block.name}" is not available.` },
    };
  }

  const parsed = tool.inputSchema.safeParse(block.input);
  if (!parsed.success) {
    ctx.log('tool.invalid_input', { name: block.name, issues: parsed.error.issues });
    return {
      ok: false,
      output: { error: 'invalid_input', issues: parsed.error.issues },
    };
  }

  try {
    const output = await tool.execute(parsed.data, ctx);
    return { ok: true, output };
  } catch (err) {
    ctx.log('tool.error', {
      name: block.name,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      output: {
        error: 'tool_failed',
        message: err instanceof Error ? err.message : 'unknown error',
      },
    };
  }
}
