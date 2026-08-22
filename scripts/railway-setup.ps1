# Railway setup helper for Windows PowerShell
param()

Write-Host "== Railway CLI check ==" -ForegroundColor Cyan
try {
  $ver = bunx railway --version 2>&1
  Write-Host "✓ $ver" -ForegroundColor Green
} catch {
  Write-Host "✗ railway CLI not found. Installing via bun..." -ForegroundColor Yellow
  bun add -d @railway/cli
}

Write-Host "`n== Next steps ==" -ForegroundColor Cyan
Write-Host @"
1. Authenticate (opens browser):
   bunx railway login

2. Link this directory to your Railway project:
   bunx railway link
   # pick project + environment (production)

3. Verify Postgres link:
   bunx railway variables
   # Expect DATABASE_URL, PGHOST, etc. If missing, add reference:
   # Railway dashboard → Postgres → Variables → Add Reference → app service → DATABASE_URL

4. Set required app vars if not present:
   bunx railway variables --set "BETTER_AUTH_SECRET=$([Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }) ) )"
   bunx railway variables --set "APP_URL=https://<app>.up.railway.app"
   bunx railway variables --set "DATABASE_PROVIDER=railway"

5. (Optional) Wire sandboxed runner:
   # Create second service from services/runner (Root Directory = services/runner)
   # Set in runner service: RUNNER_TOKEN=<secret>, PORT=3001
   # Set in app service:
   bunx railway variables --set "RUNNER_URL=http://runner.railway.internal:3001"
   bunx railway variables --set "RUNNER_TOKEN=<same-secret>"

6. Deploy:
   bunx railway up
   bunx railway logs --follow

Local dev against Railway DB:
  bunx railway variables --kv | Select-String DATABASE_PUBLIC_URL
  # Copy that value into .env.local as DATABASE_URL (ensure ?sslmode=require or leave to auto-SSL)
  bun run dev

Healthcheck:
  curl https://<app>.up.railway.app/api/health
"@

Write-Host "`nRunning node helper (env check)..." -ForegroundColor Cyan
node scripts/railway-setup.mjs
