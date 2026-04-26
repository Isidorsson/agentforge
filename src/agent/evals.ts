import type { AppContext } from '../app.js';
import { runAgent } from './loop.js';

interface EvalCase {
  id: string;
  prompt: string;
  /** Substring(s) the final answer must contain (case-insensitive). */
  expectedSubstrings: string[];
  /** Optional: tools that should have been called at least once. */
  expectedTools?: string[];
}

const FIXTURES: EvalCase[] = [
  {
    id: 'tinybus-knowledge',
    prompt: 'What technique does tinybus use to claim jobs across worker processes?',
    expectedSubstrings: ['SKIP LOCKED'],
    expectedTools: ['search_docs'],
  },
  {
    id: 'collab-board-backpressure',
    prompt: 'How does collab-board handle slow clients? Answer briefly.',
    expectedSubstrings: ['evict'],
    expectedTools: ['search_docs'],
  },
  {
    id: 'plain-arithmetic',
    prompt: 'What is 17 * 23? Answer with only the number.',
    expectedSubstrings: ['391'],
  },
];

export interface EvalReport {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  cases: Array<{
    id: string;
    pass: boolean;
    answer: string;
    toolsCalled: string[];
    failureReason?: string;
  }>;
}

export async function runEvalSuite(ctx: AppContext): Promise<EvalReport> {
  const start = Date.now();
  const results: EvalReport['cases'] = [];

  for (const c of FIXTURES) {
    let answer = '';
    const toolsCalled: string[] = [];

    try {
      for await (const event of runAgent({
        anthropic: ctx.anthropic,
        model: ctx.env.ANTHROPIC_MODEL,
        maxIterations: ctx.env.MAX_AGENT_ITERATIONS,
        messages: [{ role: 'user', content: c.prompt }],
        log: () => undefined,
      })) {
        if (event.type === 'text_delta') answer += event.text;
        if (event.type === 'tool_call') toolsCalled.push(event.tool);
      }

      const lowered = answer.toLowerCase();
      const missingSubstring = c.expectedSubstrings.find((s) => !lowered.includes(s.toLowerCase()));
      const missingTool = c.expectedTools?.find((t) => !toolsCalled.includes(t));

      if (missingSubstring) {
        results.push({
          id: c.id,
          pass: false,
          answer,
          toolsCalled,
          failureReason: `expected substring not found: "${missingSubstring}"`,
        });
      } else if (missingTool) {
        results.push({
          id: c.id,
          pass: false,
          answer,
          toolsCalled,
          failureReason: `expected tool not called: ${missingTool}`,
        });
      } else {
        results.push({ id: c.id, pass: true, answer, toolsCalled });
      }
    } catch (err) {
      results.push({
        id: c.id,
        pass: false,
        answer,
        toolsCalled,
        failureReason: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs: Date.now() - start,
    cases: results,
  };
}
