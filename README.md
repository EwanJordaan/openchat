# OpenChat

OpenChat is a ChatGPT-style AI chat application built with Next.js App Router. It supports guest and authenticated chat, role-based controls, model management, file attachments, and a full admin dashboard.

## Features

- ChatGPT-like UX with responsive sidebar, model picker, chat composer, and light/dark theme
- Guest mode on `/` (admin can enable/disable and choose guest models)
- Persistent chats on `/chat/[id]` with chat-id caching
- Drizzle-backed auth sessions, user roles, and SQL storage
- Admin dashboard for provider keys, model controls, role limits, and user roles
- Comprehensive user settings page
- File upload and attachment support
- Provider abstraction with OpenAI-compatible API support and encrypted provider keys

## Tech Stack

- Next.js 16 + React 19
- TypeScript
- Drizzle ORM
- SQL providers via env switch: `postgres`, `supabase`, `neon`, `mysql`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env.local
```

3. Set `DATABASE_PROVIDER` and `DATABASE_URL`.

4. Start dev server:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Important env vars

- `DATABASE_PROVIDER`: `postgres | supabase | neon | mysql`
- `DATABASE_URL`: SQL connection string
- `ADMIN_EMAILS`: comma-separated emails auto-assigned admin role
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`: optional bootstrap admin account created at startup
- `SETTINGS_ENCRYPTION_KEY`: encrypts provider API keys stored in DB
- `OPENAI_API_KEY`: optional fallback key (dashboard value takes priority)
- `OPENAI_API_KEY_LOCAL` / `OPENAI_API_KEY_VERCEL` / `OPENAI_API_KEY_CLOUDFLARE`: platform-specific fallback keys
- `OPENAI_BASE_URL_LOCAL` / `OPENAI_BASE_URL_VERCEL` / `OPENAI_BASE_URL_CLOUDFLARE`: platform-specific fallback base URLs

Provider precedence at runtime:

1. Admin dashboard provider credentials stored in the database
2. Platform-specific env vars (`*_LOCAL`, `*_VERCEL`, `*_CLOUDFLARE`) based on detected runtime
3. Generic env vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`)

## Admin access

Register with an email listed in `ADMIN_EMAILS` to automatically receive admin role. Then visit `/admin`.

## Notes

- Database tables are auto-created and seeded on startup.
- Uploaded files are stored locally in `.uploads/` (good for local/dev; use object storage for production).

## Supabase Connection Troubleshooting

- If you see `getaddrinfo ENOTFOUND db.<project-ref>.supabase.co`, your network/runtime likely cannot use the IPv6-only direct DB host.
- Use the Supabase Session/Transaction pooler URL (port `6543`) as `DATABASE_URL` instead of the direct `db.<project-ref>.supabase.co` host.
- The pooler URL includes your region and username in this pattern:

```text
postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres
```
