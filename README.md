# agentforge

A small Express + TypeScript service that exposes a Claude-backed agent with **streaming**, **tool use**, **prompt caching**, and an **eval harness**. Sibling project to [tinybus](../../GoLang/tinybus) and [collab-board](../../GoLang/collab-board) — same observability and operational shape, different language and problem domain.

## Why this exists

I wanted a Node-side artifact that demonstrates the patterns most production agent backends actually need:

- **Streaming end-to-end** — Anthropic SSE → server SSE → browser. The user sees tokens appear as the model generates them.
- **Tool use loop** — model issues `tool_use`, server executes locally, results feed back into the next turn. Sequential by default; the policy is one comment block away from parallel.
- **Prompt caching** — system prompt and tool definitions marked `cache_control: ephemeral`. Cache hits land at ~10% the input cost.
- **Idempotent failure** — agent runs are safe to abort mid-stream; partial assistant text is persisted only after the run completes.
- **Eval harness** — `POST /v1/evals/run` exercises a fixture suite against the live model. Pass/fail is checked on substring + tool-call expectations.

## Stack

- Node 22, TypeScript (strict, ESM, `noUncheckedIndexedAccess`)
- Express 4, Pino, Zod, prom-client
- Anthropic SDK (`@anthropic-ai/sdk` ^0.40)
- Postgres + raw SQL migrations (no ORM, mirrors tinybus)
- Vitest + supertest

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/chat` | Run the agent on a new user message; streams `AgentEvent`s as SSE |
| `POST` | `/v1/sessions` | Create a session |
| `GET`  | `/v1/sessions/:id` | Fetch a session and its full message history |
| `POST` | `/v1/evals/run` | Run the eval suite, return a pass/fail report |
| `GET`  | `/healthz` | Liveness + DB reachability check |
| `GET`  | `/metrics` | Prometheus text format |

### Chat request

```http
POST /v1/chat
Content-Type: application/json

{ "session_id": "<uuid?>", "message": "Why does tinybus use SKIP LOCKED?" }
```

Response is `text/event-stream`. Each event has a `type` matching one of:
`session`, `iteration_start`, `text_delta`, `tool_call`, `tool_result`, `usage`, `done`, `error`.

## Local development

```bash
docker compose up -d              # starts Postgres on :5432
cp .env.example .env              # set ANTHROPIC_API_KEY
npm install
npm run migrate
npm run dev                       # http://localhost:3000
```

Open `http://localhost:3000/` for the bundled demo UI.

## Deploy to Railway

1. Push this folder to a GitHub repo.
2. New Railway project → "Deploy from GitHub" → pick the repo.
3. Add the **Postgres** plugin — Railway sets `DATABASE_URL` automatically.
4. Set `ANTHROPIC_API_KEY` in the service variables.
5. Railway runs `node dist/db/migrate.js && node dist/index.js` per `railway.json`.

The bundled `Dockerfile` is multi-stage and runs on a distroless base, same shape as tinybus.

## Architecture

```
HTTP → Express middleware (pino-http, prom-client) → routes
   /v1/chat → SSE → runAgent() ──▶ Anthropic.messages.stream
                          │              │
                          │              └──▶ tool_use? ──▶ TOOLS_BY_NAME[name].execute()
                          │                                         │
                          │       ◀────────── tool_result ◀─────────┘
                          ▼
                       Postgres (sessions, messages)
```

`runAgent` is an async generator yielding `AgentEvent`s — the route layer is a thin pump from the generator to the SSE writer. That separation makes the loop straightforward to unit-test (no HTTP) and easy to drive from the eval harness, which uses the same generator.

## Where to extend

Three spots have explicit TODO blocks for design decisions:

- `src/agent/loop.ts` — tool-execution policy (sequential vs parallel, error handling).
- `src/agent/cache.ts` — prompt-cache breakpoint strategy.
- `src/obs/metrics.ts` — which agent-specific counters and histograms to expose.

Each block explains the trade-off and the 5–10 lines of code needed.

## Why no ORM?

Same reason tinybus uses raw SQL — three tables, two indexes, full SQL is easier to read than ORM-flavored SQL. If this grows past ~10 tables, reach for [drizzle](https://orm.drizzle.team).

## License

MIT
