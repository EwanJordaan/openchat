#!/usr/bin/env node
// Helper to verify Railway env + DB link without requiring `railway` binary in CI
import fs from "node:fs";

const required = ["BETTER_AUTH_SECRET", "DATABASE_URL"];
const optional = ["APP_URL", "RUNNER_URL", "RUNNER_TOKEN", "PGHOST", "PGUSER", "PGPASSWORD"];

function checkEnv() {
  console.log("== Railway env check ==\n");
  let ok = true;
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`✗ Missing ${k}`);
      ok = false;
    } else {
      const v = process.env[k];
      const preview = k.includes("SECRET") || k.includes("PASSWORD") || k.includes("URL") ? `${v.slice(0, 32)}…` : v;
      console.log(`✓ ${k}=${preview}`);
    }
  }
  for (const k of optional) {
    if (process.env[k]) console.log(`  ${k}=${String(process.env[k]).slice(0, 50)}`);
  }

  // detect railway host
  const url = process.env.DATABASE_URL ?? "";
  if (url.includes("railway.internal")) console.log("\n→ Using Railway private network (railway.internal) — SSL disabled, in-cluster only.");
  else if (url.includes("proxy.rlwy.net")) console.log("\n→ Using Railway public proxy (proxy.rlwy.net) — SSL enabled.");
  else if (url.includes("localhost")) console.log("\n→ Using local Postgres (docker).");
  else if (url) console.log(`\n→ DATABASE_URL host: ${(() => { try { return new URL(url).hostname; } catch { return "(unparseable)"; }})()}`);

  if (process.env.RUNNER_URL) console.log(`→ Runner: ${process.env.RUNNER_URL}`);
  else console.log("→ Runner: not configured (local vm fallback)");

  console.log(`\n${ok ? "✓ Env looks good" : "✗ Fix missing vars, then retry"}`);
  return ok;
}

function printNextSteps() {
  console.log(`
Next steps (Railway):

1. bunx railway login
2. bunx railway link   # pick project + environment
3. bunx railway variables   # verify DATABASE_URL appears (auto-injected after linking Postgres)
   If not: Railway dashboard → Postgres service → Variables → Add Reference → pick your app service.
4. Set missing vars:
   bunx railway variables --set "BETTER_AUTH_SECRET=$(openssl rand -hex 32 | tr -d '\\n')"
   bunx railway variables --set "APP_URL=https://<app>.up.railway.app"
   bunx railway variables --set "DATABASE_PROVIDER=railway"
   # optional runner
   bunx railway variables --set "RUNNER_URL=http://runner.railway.internal:3001"
   bunx railway variables --set "RUNNER_TOKEN=$(openssl rand -hex 32 | tr -d '\\n')"

5. bunx railway up    # deploy
6. bunx railway logs  # tail

Local against Railway DB:
  bunx railway variables --kv | findstr DATABASE_PUBLIC_URL
  Copy that URL into .env.local as DATABASE_URL (with ?sslmode=require)
`);
}

const ok = checkEnv();
printNextSteps();
if (!ok) process.exit(1);

if (fs.existsSync("railway.json")) console.log("\n✓ railway.json present");
else console.warn("\n✗ railway.json missing — add it at repo root");

if (fs.existsSync("services/runner/server.ts")) console.log("✓ services/runner present");
else console.warn("✗ services/runner missing");
