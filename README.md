# OpenChat — Agentic Workspace

Doc-native, tool-using chat workspace. Upload or ingest documents, organize them into **Projects**, and chat with an agent that grounds answers in your own sources via hybrid vector + keyword retrieval.

Built on Next.js 16 + React 19, Drizzle ORM, pgvector, S3/MinIO, and the AI SDK. Deploys to **Railway** with linked Postgres + sandboxed runners.

---

## Vision

ChatGPT UX, but grounded. The model is not the source of truth — **your documents are**.

- **Upload once, ask many times**: PDFs, DOCX, Markdown, CSV, JSON, images → parsed, chunked, embedded, and indexed.
- **Cite or it didn't happen**: every grounded answer streams with per-chunk citations (doc title, page, heading, score).
- **Agentic, not autocomplete**: the assistant plans, searches, reads, writes, runs code, and asks for help — looping until done.
- **Guest-friendly, admin-controllable**: guests get ephemeral projects/chats via `openchat_guest` cookie; admins manage models, providers, and limits.
- **Runs anywhere Postgres + S3 run**: local `pgvector/pgvector:pg16` + MinIO for dev, **Railway Postgres** + Volumes/S3 for prod.

---

## Agentic Capabilities (Tool List)

The agent sees these tools via `getToolsForLlm()` and executes them through `lib/agent/registry.ts`:

| Tool | Description | Key Input |
|------|-------------|-----------|
| `search_documents` | Hybrid vector + keyword search across `document_chunks` (per-project or global). Returns scored chunks with citations. | `query`, `projectId?`, `topK?` |
| `read_document` | Read a single document's assembled markdown (or a slice). | `documentId`, `offset?`, `limit?` |
| `list_documents` | List documents in project / owned by actor. | `projectId?` |
| `ingest_url` | Fetch a URL, parse, chunk, and index as a document. | `url`, `projectId?` |
| `ingest_repo_files` | Ingest text files from a repo path (local allowlist). | `paths[]`, `projectId?` |
| `write_document` | Create a new document from markdown/text in a project. | `title`, `content`, `projectId?` |
| `run_code` | Execute code in **sandboxed runner** (JS via vm, Python via runner). Falls back to in-process vm if `RUNNER_URL` unset. | `lang`, `code`, `timeoutMs?` |
| `web_search` | Web search via Tavily (stub in dev, live when `TAVILY_API_KEY` set). | `query`, `count?` |
| `ask_user` | Pause and ask the user a clarifying question. | `question` |
| `get_time` | Current server time (ISO + unix). No input. | — |
| `calc` | Safe math eval (`+ - * / ( ) .`). | `expression` |

All tools are zod-validated; invalid input returns `{ ok:false, error }` without calling the LLM. Tool calls stream as `tool_call` / `tool_result` SSE events and are persisted to `tool_events`.

`run_code` on Railway calls the **Runner service** (`RUNNER_URL`) — see `services/runner/README.md`. Without `RUNNER_URL`, JS runs locally via `node:vm`; Python returns an error.

---

## Doc Intelligence Pipeline

```
Upload (presigned POST → S3/MinIO)
  → POST /api/docs/ingest or /api/docs/upload-complete
    → documents row (status=pending, storage_key, mime)
      → ingestDocument() [lib/docs/index.ts]
        ├─ getObject(storage_key) via lib/storage/s3.ts
        ├─ parseDocument() [lib/docs/parse.ts]
        │   ├─ pdfjs-dist (PDF)  ├─ mammoth (DOCX)
        │   ├─ csv-parse / JSON / text passthrough
        │   └─ image → placeholder (+ future vision)
        │   => { markdown, pages[], pageCount, tokenEstimate }
        ├─ chunkText() [lib/docs/chunk.ts]
        │   ├─ extractSections() via ^#{1,6} headings
        │   ├─ splitByTokens(512, overlap 80) per section
        │   └─ => ChunkInput[] { content, heading, page, ordinal, charOffset, tokenCount }
        ├─ INSERT document_chunks (tsv via to_tsvector, embedding NULL)
        ├─ embedChunks() [lib/docs/embed.ts] → embedTexts() [lib/llm/embed.ts]
        │   ├─ EMBED_PROVIDER=openai → POST /v1/embeddings (text-embedding-3-small)
        │   ├─ EMBED_PROVIDER=voyage → api.voyageai.com (voyage-3-lite, padded to VECTOR_DIMS)
        │   └─ EMBED_PROVIDER=local or no key → fakeEmbedding() (deterministic hash → unit vector)
        │   + retry with exponential backoff, batch 96
        └─ UPDATE document_chunks embedding = '[...]'::vector, status=ready
          (falls back to pg_trgm/ILIKE if pgvector unavailable)

Polling fallback: workers/ingest.ts polls every 5s for status in (pending,parsing,chunking,embedding).
```

**Chunking notes**

- `512` tokens (≈2048 chars) per chunk, `80` token overlap, cap `560` tokens.
- Heading-aware: `# Title\n\nbody` kept together per chunk.
- Page mapped via `pageMap` when PDF parser returns per-page texts; otherwise proportional heuristic.

---

## Projects & Retrieval

- **Projects** (`projects` + `project_members`) are the unit of isolation. Docs and chats belong to a project via `project_id`. Guest projects are keyed by `guest_id`; user projects by `owner_user_id`.
- **Retrieval** (`lib/agent/retrieval.ts`):
  1. `embedQuery(query)` → query vector.
  2. `retrievePgVector` → `ORDER BY embedding <=> $1::vector` + HNSW index `idx_doc_chunks_embedding_hnsw` (cosine). Top 12.
  3. If best distance > 0.78, merge keyword results.
  4. `retrievePgKeyword` → `tsv @@ plainto_tsquery` + `ts_rank` via GIN index `idx_doc_chunks_tsv_gin`.
  5. Fallback: `ILike` / `LIKE` on `content` (MySQL path uses this).
  6. `buildGroundingBlock(chunks)` → `<grounding>[Doc: title pN chunk=id heading="…" score=0.800]\ncontent…</grounding>`
- **Grounding**: `runAgent` fetches 12 chunks pre-loop and injects `grounding` into the system prompt alongside `buildSystemPrompt(preset, count)`. Citations are streamed as a `citations` SSE event and rendered inline as chips.

---

## Agent Loop

`lib/agent/run.ts` → `runAgent()` is an async generator yielding `AgentEvent`s:

```
plan(query) → subTasks[]                    [lib/agent/planner.ts]
retrieve(query, projectId) → chunks         [lib/agent/retrieval.ts]
yield {meta, citations}
for turn 0..11:
  systemPrompt = buildSystemPrompt(preset, retrieved.length)
  llmModel = getLlm(modelId)  // openai/anthropic via lib/llm/provider.ts (reads provider keys, supports encrypted)
  if !llmModel → demo mode (echo grounding)
  tools = getToolsForLlm()
  stream = streamLlm({ model, messages, tools, systemPrompt })
  for each part in stream.fullStream:
    text-delta → yield token
    tool-call  → yield tool_call + collect
    error      → yield error
  if no tool calls → yield done + return
  compressMessages(messages) if >12k tokens  [lib/agent/memory.ts]
  for each toolCall:
    executeTool(name, args, ctx) → {ok, output, citations?, error}
    yield tool_result
    push assistant(toolCalls) + tool(result) to messages
  re-retrieve (refresh grounding for next turn)
yield done
```

Transport: `POST /api/agent/run` consumes the generator and forwards SSE (`lib/chat/sse.ts`) with event types `meta | token | tool_call | tool_result | citations | done | error`.

Presets: `research` (thorough, compare), `analyst` (numbers/tables/risks), `builder` (steps/code). Controlled by `agent_preset` on the chat row.

---

## Architecture Diagram (text)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser — WorkspaceShell (3 cols)                                 │
│  ┌──────────┐  ┌─────────────────────┐  ┌──────────────────┐       │
│  │Projects  │  │ MessageStream       │  │ DocViewer /      │       │
│  │DocList   │◄─┤ Composer            │◄─┤ Trace (tool      │       │
│  │Dropzone  │  │ Agent traces + cits │  │  calls/results)  │       │
│  └────┬─────┘  └──────────┬──────────┘  └──────────────────┘       │
│       │ file → presign    │ POST /api/agent/run (SSE)              │
└───────┼───────────────────┼─────────────────────────────────────────┘
        │                   │
        ▼                   ▼
   ┌─────────┐      ┌──────────────┐      ┌──────────────────┐
   │ /api/*  │      │ lib/agent/*  │      │ lib/docs/*       │
   │ presign │      │ run.ts ───►LLM├─────►│ parse/chunk/embed│
   │ ingest  │◄────►│ retrieval    │      │ storage/s3       │
   │ docs    │      │ registry     │◄────►│ workers/ingest   │
   └────┬────┘      └──────┬───────┘      └────────┬─────────┘
        │                  │                       │
        ▼                  ▼                       ▼
   ┌────────────────────────────────────────────────────────┐
   │  Railway Postgres 16 + pgvector + pg_trgm               │
   │  documents / document_chunks (vector(1536)+tsv+GIN+HNSW)│
   │  projects / chats / messages / tool_events / users etc │
   └────────────────────────────────────────────────────────┘
        │                         ▲
        ▼                         │ private network
   ┌─────────┐   ┌──────────┐   ┌──────────────────┐
   │   S3    │   │ LLM APIs │   │ Runner (sandbox) │
   │ MinIO/  │   │ OpenAI   │   │ services/runner  │
   │ R2      │   │ Anthropic│   │ vm + python      │
   └─────────┘   └──────────┘   └──────────────────┘
```

Key dirs:

- `app/(workspace)` — shell pages, `app/api/{agent,docs,projects,chats,files,health}` — routes
- `components/{workspace,chat,composer,docs,projects,agent}` — UI
- `lib/{agent,docs,llm,storage,db,hooks,cache,auth,security}` — domain
- `workers/ingest.ts` — poll worker
- `services/runner` — sandboxed code execution microservice (Railway second service)
- `supabase/migrations/001_agentic_core.sql` — baseline schema (vector, projects, docs, chunks, chats/messages/tools) — same DDL used on Railway

---

## Setup

### Prereqs

- Node 20+ · Bun 1.2+ · Postgres 16 with `vector` + `pg_trgm` (Railway Postgres or docker below) · Optional: MinIO/Redis (included in compose)

### 1. Install

```bash
bun install
cp .env.example .env.local
# edit BETTER_AUTH_SECRET (32+ chars), DATABASE_URL, S3_*, ANTHROPIC_API_KEY etc.
```

### 2. Local infra (docker) — optional if using Railway DB

`docker-compose.yml` (dev) and `docker-compose.test.yml` (integration tests) both include the full stack:

```bash
docker compose up -d                # postgres:5432, redis:6379, minio:9000/9001
# or test infra only (alternate port 55432):
docker compose -f docker-compose.test.yml up -d postgres-test redis minio
# check health
docker compose ps
```

- Postgres image: `pgvector/pgvector:pg16` — exposes `vector` + `pg_trgm`.
- MinIO console: `http://localhost:9001` (minioadmin / minioadmin); bucket `openchat-uploads` is auto-created by bootstrap or presign path.
- Redis: currently health-checked but not required for basic chat; reserved for rate limiting / queue.

### 3. Database

No manual migration needed for local dev — `ensureDatabase()` in `lib/db/bootstrap.ts` creates extensions/tables/indexes on first request. For explicit control:

```bash
# push via drizzle-kit (reads drizzle.config.ts — supports Railway DATABASE_URL / PGHOST)
bunx drizzle-kit push

# or apply the checked-in SQL
psql "$DATABASE_URL" -f supabase/migrations/001_agentic_core.sql
```

### 4. Run

```bash
bun run dev        # http://localhost:3000
bun run build      # production check (Next 16)
```

Guest mode works out of the box — a `openchat_guest` httpOnly cookie is minted by `middleware.ts` on the first `/api/*` request (and via `resolveActor()` for pages). No login required. Register or set `ADMIN_EMAILS` to get admin.

---

## Railway Deploy

### A. Postgres

1. **Railway dashboard → New Project** (or link existing GitHub repo)
2. **Add Postgres**: `New → Database → PostgreSQL` (Railway adds `pgvector` on Postgres 16; if `vector` extension missing, set service to custom image `pgvector/pgvector:pg16` in `Settings → Deploy → Custom Image` or run `CREATE EXTENSION vector` manually)
3. **Link to app service**: In your app service `Variables → Add Reference → DATABASE_URL` (and optionally `DATABASE_PROVIDER=railway`). Railway injects:
   - `DATABASE_URL` (private: `postgres.railway.internal`) for in-cluster
   - `DATABASE_PUBLIC_URL` (public: `proxy.rlwy.net`) for local dev
   - Individual `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` as fallback
4. **No .env needed in production** — `lib/db/client.ts` auto-detects `resolveDatabaseUrl()` and SSL:
   - `railway.internal` → `ssl: false`
   - `proxy.rlwy.net` / hosted → `ssl: { rejectUnauthorized: false }`
   - Localhost → no SSL
5. Healthcheck is `GET /api/health` (see `railway.json`). Set in Railway `Settings → Deploy → Healthcheck Path = /api/health`.

### B. App service

- Build: `nixpacks` — `railway.json` at repo root sets `buildCommand: bun install --frozen-lockfile && bun run build`, `startCommand: bun run start`
- Env vars to set on Railway (besides the auto-injected DB):
  ```
  BETTER_AUTH_SECRET=<32+ chars, openssl rand -hex 32>
  APP_URL=https://<your-app>.up.railway.app
  SETTINGS_ENCRYPTION_KEY=<32 chars>
  ADMIN_EMAILS=you@example.com
  ADMIN_SEED_EMAIL=you@example.com
  ADMIN_SEED_PASSWORD=<strong>
  OPENAI_API_KEY / ANTHROPIC_API_KEY / TAVILY_API_KEY / VOYAGE_API_KEY
  S3_* (or leave empty for .uploads fallback; recommend R2/S3 in prod)
  ```
- `DATABASE_PROVIDER=railway` (optional, defaults to `postgres` — both work; `railway` documents intent)
- Railway private networking lets the app reach Postgres at `postgres.railway.internal` with zero egress and no SSL.

### C. Sandboxed runners (second service)

See `services/runner/README.md`. TL;DR:

```bash
# 1. Create second service from same repo
#    Railway → New Service → GitHub Repo → set Root Directory = services/runner
#    Or: New Empty Service → connect Dockerfile at services/runner/Dockerfile

# 2. Set its variables
RUNNER_TOKEN=$(openssl rand -hex 32)   # same value in both services
PORT=3001

# 3. In app service, add:
RUNNER_URL=http://runner.railway.internal:3001
RUNNER_TOKEN=<same>
```

Without `RUNNER_URL`, `run_code` falls back to in-process `vm` (JS only). With it, JS + Python are sandboxed in the runner container (non-root, isolated vm, timeout 3–10s, 8k output cap).

### D. Railway CLI (local)

```bash
# Install (already added as devDependency — use bunx)
bunx railway --version   # 5.43.1+

# Login — browser flow; run in project dir:
bunx railway login

# Link to your Railway project:
bunx railway link        # pick the project + environments (production)

# Link Postgres & redeploy:
bunx railway variables   # verify DATABASE_URL present
bunx railway up          # deploy current dir
bunx railway logs        # tail
bunx railway run psql $DATABASE_URL -c "select 1"  # test DB
```

We wrap this in `scripts/railway-setup.ps1` / `.sh` — run `bun run railway:login` etc. See `package.json`.

### Local against Railway DB

```bash
# Copy public URL for local dev
bunx railway variables --kv | grep DATABASE_PUBLIC_URL
# or: Railway dashboard → Postgres → Connect → Public Network → copy URL
# Paste into .env.local:
DATABASE_URL=postgresql://postgres:xxx@monorail.proxy.rlwy.net:xxxxx/railway?sslmode=require
DATABASE_PROVIDER=railway
bun run dev
```

> **Supabase/Neon legacy**: still supported (`DATABASE_PROVIDER=supabase|neon`). If you see `ENOTFOUND db.<ref>.supabase.co`, use the pooler URL `aws-0-<region>.pooler.supabase.com:6543`. Railway is now the default recommendation.

---

## Env vars

All vars are validated by `lib/env.ts` (zod). `.env.example` is the canonical list.

| Var | Default | Description |
|-----|---------|-------------|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `APP_URL` | `http://localhost:3000` | Public origin (auth callbacks, presign). On Railway set to `https://<app>.up.railway.app`. |
| `BETTER_AUTH_SECRET` | *(required, ≥32)* | Session signing secret. |
| `DATABASE_PROVIDER` | `postgres` | `postgres` \| `railway` \| `supabase` \| `neon` \| `mysql` — `railway` is alias for `postgres` with docs intent. |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/openchat` | SQL connection string. On Railway auto-injected; local can be `DATABASE_PUBLIC_URL`. Falls back to `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` if unset. |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | — | Railway fallback individually injected vars. |
| `DATABASE_PRIVATE_URL` / `DATABASE_PUBLIC_URL` | — | Railway private vs public URL; `resolveDatabaseUrl()` prefers `DATABASE_URL` then these. |
| `RUNNER_URL` | — | Sandboxed runner origin, e.g. `http://runner.railway.internal:3001`. |
| `RUNNER_TOKEN` | — | Shared secret for runner auth (`Bearer` token). |
| `RUNNER_TIMEOUT_MS` | `10000` | Runner request timeout cap. |
| `SESSION_COOKIE_NAME` | `openchat_session` | Auth session cookie. |
| `GUEST_COOKIE_NAME` | `openchat_guest` | Guest id cookie (httpOnly, 180d). |
| `SESSION_TTL_DAYS` | `30` | Session TTL. |
| `AUTH_LOGIN_WINDOW_MS` / `_MAX_ATTEMPTS` / `_BLOCK_MS` | `600000` / `5` / `900000` | Login rate limit. |
| `AUTH_REGISTER_WINDOW_MS` / `_MAX_ATTEMPTS` / `_BLOCK_MS` | `900000` / `3` / `1200000` | Register rate limit. |
| `SETTINGS_ENCRYPTION_KEY` | — | Encrypts provider keys in DB (optional but recommended). |
| `ADMIN_EMAILS` | `""` | CSV that auto-gets `admin` role. |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | first of `ADMIN_EMAILS` / `""` | Bootstrap admin at startup if password set. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL. |
| `OPENAI_API_KEY` | — | Fallback; DB `provider_credentials` takes priority. |
| `ANTHROPIC_API_KEY` | — | For Claude models (`claude-3-5-*`). |
| `VOYAGE_API_KEY` | — | For `voyage-3-lite` embeddings when `EMBED_PROVIDER=voyage`. |
| `TAVILY_API_KEY` | — | For live `web_search` (stubbed if missing). |
| `VECTOR_DIMS` | `1536` | pgvector dims; shorter voyage vectors are zero-padded. |
| `EMBED_PROVIDER` | `openai` | `openai` \| `voyage` \| `local` (deterministic fake). |
| `EMBED_MODEL` | `text-embedding-3-small` | Model id (voyage default `voyage-3-lite` if voyage). |
| `S3_ENDPOINT` | `http://localhost:9000` | S3/MinIO endpoint. Missing creds ⇒ fallback to `.uploads/` on disk (dev only). |
| `S3_BUCKET` | `openchat-uploads` | Bucket name. |
| `S3_ACCESS_KEY` | `minioadmin` |  |
| `S3_SECRET_KEY` | `minioadmin` |  |
| `S3_REGION` | `us-east-1` |  |
| `MAX_UPLOAD_MB` | `12` | Per-file limit, enforced in presign + ingest. |
| `PORT` | `3000` | Injected by Railway; Next reads it automatically. |

Storage behavior (`lib/storage/s3.ts`): presigned POST via `@aws-sdk/s3-presigned-post`; `getObject`/`putObject` try S3 first, then fall back to `.uploads/<key>` if creds missing or S3 down. On Railway consider Mounted Volumes (`.uploads`) or R2/S3 for durable storage.

---

## Testing

```bash
bun test                 # all tests (unit + integration if DB up)
bun run test:unit         # → bun test tests/unit  (fast, no DB)
bun run test:integration  # → bun test tests/integration (needs postgres-test)
bun run test:ci           # unit + integration sequentially
bun run test:coverage     # coverage + thresholds via scripts/check-coverage.mjs
```

- Harness: `bunfig.toml` preloads `tests/setup/global.ts` (sets `BETTER_AUTH_SECRET`, `DATABASE_URL`, etc.). No manual env export needed.
- Unit tests live in `tests/unit/` (≥4 files):
  - `utils.test.ts` — `createId`, `parseJson`, `toBool`
  - `chunk.test.ts` — `chunkText` / `splitByTokens` heading & overlap semantics
  - `retrieval.test.ts` — `buildGroundingBlock` formatting/citation contract (embeds mocked)
  - `registry.test.ts` — tool zod schemas + `executeTool` / `getToolsForLlm` registry
- Integration tests (under `tests/integration/`) require the test DB:

```bash
docker compose -f docker-compose.test.yml up -d postgres-test
bun run test:integration
```

- Lint/typecheck/build (run before every commit):

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # eslint (next/core-web-vitals)
bun run build       # next build (Turbopack)
```

---

## Roadmap

- [ ] **Auth hardening**: OAuth providers via better-auth, 2FA for admins.
- [ ] **Live web_search**: wire Tavily (and Brave/SerpAPI fallback) when `TAVILY_API_KEY` set; add domain allowlist + caching.
- [ ] **Vision + OCR**: image ingestion via tesseract.js / cloud vision; caption store alongside markdown.
- [ ] **Background queue**: replace poll worker with BullMQ (Redis) or pg-boss; add webhooks on doc `ready`/`failed`.
- [ ] **Multi-project memory**: cross-project retrieval + per-project system prompts / agent presets marketplace.
- [ ] **Eval harness**: groundedness + citation precision benchmarks; golden Q/A set under `tests/eval/`.
- [ ] **Migrations hygiene**: move bootstrap DDL to `drizzle-kit generate` diffs; keep `001_agentic_core.sql` as seed.
- [ ] **Proxy migration**: when Next 16 removes middleware warning, rename `middleware.ts` → `proxy.ts` (no logic change).
- [ ] **Observability**: per-tool latency in `tool_events`, token usage rollup, Langfuse/OpenTelemetry tracing.
- [ ] **Prod storage**: R2 / S3 lifecycle, presign expiry tuning, multipart upload for >12 MB + Railway Volumes.
- [x] **Railway Postgres**: private networking + SSL auto-detection, `railway.json`/`nixpacks.toml`, healthcheck.
- [x] **Sandboxed runners**: `services/runner` second service via `RUNNER_URL`.

---

## Admin

Register with an email in `ADMIN_EMAILS` → admin. Visit `/admin` for provider keys, model toggles, role limits, user roles. Dashboard is server-rendered and gated by `resolveActor()`.

## License

MIT — see `LICENSE` (add one if missing).
