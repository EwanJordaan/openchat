# OpenChat Runner — Sandboxed Code Execution

Second Railway service that isolates `run_code` tool execution from the main Next.js app.

## What it does
- `POST /run` — executes `lang: js|ts|python` with timeout + output cap (8k)
  - `js`: Node `vm` context — no `require`, `fs`, `process`, or network
  - `python`: `python3 -c` subprocess (Alpine python3) with same timeout/cap
  - `ts`: stub until transpilation enabled
- `GET /health` — Railway healthcheck
- Auth via `RUNNER_TOKEN` (`Authorization: Bearer <token>` or `x-runner-token`)

## Railway setup
1. In Railway dashboard: **New Service → Empty Service** (or GitHub repo, root = `services/runner`)
2. Set **Root Directory** = `services/runner` if deploying from monorepo, or ensure `Dockerfile` path is `services/runner/Dockerfile`
3. Variables:
   - `RUNNER_TOKEN` — generate `openssl rand -hex 32`
   - `PORT=3001` (Railway injects PORT automatically; runner respects it)
4. Deploy — note the **private networking host** like `runner.railway.internal`
5. In the **main app service**, set:
   - `RUNNER_URL=http://runner.railway.internal:3001` (private, no egress cost)
   - `RUNNER_TOKEN=<same secret>`
   - `RUNNER_TIMEOUT_MS=10000` (optional)

For local dev, leave `RUNNER_URL` empty — `lib/agent/tools/run_code.ts` falls back to in-process `vm`.

## Local
```bash
cd services/runner
bun install
RUNNER_TOKEN=dev-secret bun run server.ts
# test
curl -X POST http://localhost:3001/run -H 'Content-Type: application/json' -H 'Authorization: Bearer dev-secret' -d '{"lang":"js","code":"console.log(2+2)"}'
```

## Security notes
- Container runs as non-root `bun` user
- No `CAP_ADD`, read-only rootfs recommended (set in Railway service settings if available)
- Each execution is a fresh `vm` context; container isolation provides second boundary
- Output is capped to 8k, timeout defaults 3s (max 10s)
- Private networking means runner is not exposed publicly; still set a token for defense-in-depth
