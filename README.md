# openchat

OpenChat is a Next.js chat product template with an in-progress REST backend scaffold.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 for UI
- REST backend in App Router route handlers (`app/api/v1/*`)
- Auth verification with `jose` (OIDC/JWT, multi-issuer)
- Persistence adapters (Postgres/Neon implemented, Convex mode uses an in-memory adapter fallback)
- Optional local credentials auth persistence with `drizzle-orm`
- Central typed app config in `openchat.config.ts`

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values.
3. Run SQL migrations in `backend/adapters/db/postgres/migrations/001_initial.sql`, `backend/adapters/db/postgres/migrations/002_user_profile_avatar.sql`, `backend/adapters/db/postgres/migrations/003_chats.sql`, `backend/adapters/db/postgres/migrations/004_external_identity_metadata.sql`, `backend/adapters/db/postgres/migrations/005_ai_usage_daily.sql`, and `backend/adapters/db/postgres/migrations/006_local_auth.sql`.
4. Start the app:

```bash
npm run dev
```

## Backend configuration

The backend is adapter-based:

- Auth adapters normalize JWTs into one internal `Principal` shape.
- Data adapters implement repository interfaces (`Postgres` now, `Convex` next).

Set these environment variables:

- `BACKEND_DB_ADAPTER`: `postgres` (default) or `convex`
- `DATABASE_URL`: required for `postgres`
- `BACKEND_AUTH_CLOCK_SKEW_SECONDS`: optional, default `60`
- `BACKEND_AUTH_ISSUERS`: JSON array of issuer configs
- `BACKEND_AUTH_DEFAULT_PROVIDER`: optional provider name used by `GET /api/v1/auth/start`
- `BACKEND_SESSION_SECRET`: required for cookie-session login/register flows (min 32 chars)
- `BACKEND_SESSION_COOKIE_NAME`: optional, default `openchat_session`
- `BACKEND_AUTH_FLOW_COOKIE_NAME`: optional, default `openchat_auth_flow`
- `BACKEND_SESSION_SECURE_COOKIES`: optional (`true`/`false`), defaults by `NODE_ENV`
- `BACKEND_AUTH_LOCAL_ENABLED`: optional (`true`/`false`), default `false`
- `BACKEND_AUTH_LOCAL_COOKIE_NAME`: optional, default `openchat_local_session`
- `BACKEND_AUTH_LOCAL_SESSION_MAX_AGE_SECONDS`: optional integer (`300-7776000`), default `2592000`
- `BACKEND_ADMIN_COOKIE_NAME`: optional, default `openchat_admin_session`
- `BACKEND_ADMIN_PASSWORD_HASH`: optional local admin password hash (`pbkdf2_sha512$...`)
- `OPENROUTER_API_KEY`: optional provider key (editable in admin settings)
- `OPENAI_API_KEY`: optional provider key (editable in admin settings)
- `ANTHROPIC_API_KEY`: optional provider key (editable in admin settings)
- `GOOGLE_API_KEY`: optional Gemini provider key (editable in admin settings)
- `BACKEND_ADMIN_SETUP_PASSWORD`: optional bootstrap password used by `/api/v1/admin/bootstrap` (defaults to `admin`)
- `BACKEND_ADMIN_REQUIRED_EMAIL`: optional legacy bootstrap metadata used by `/api/v1/admin/bootstrap`
- `NEXT_PUBLIC_ALLOW_GUEST_RESPONSES`: optional (`true`/`false`), defaults from `openchat.config.ts`
- `NEXT_PUBLIC_DEFAULT_THEME`: optional (`default` | `galaxy` | `aurora` | `sunset` | `midnight`), defaults from `openchat.config.ts`
- `NEXT_PUBLIC_DEFAULT_MODEL_PROVIDER`: optional (`openrouter` | `openai` | `gemini` | `anthropic`), defaults from `openchat.config.ts`
- `NEXT_PUBLIC_ALLOW_USER_MODEL_PROVIDER_SELECTION`: optional (`true`/`false`), defaults from `openchat.config.ts`

Auth mode constraints:

- Only one auth mode can be active at a time.
- If `BACKEND_AUTH_LOCAL_ENABLED=true`, `BACKEND_AUTH_ISSUERS` must be empty.
- `BACKEND_AUTH_ISSUERS` supports at most one issuer entry.
- `BACKEND_AUTH_DEFAULT_PROVIDER` must be empty for local auth, and when set for OIDC it must match the configured issuer name.

Local admin password behavior:

- Local admin username is fixed to `admin`.
- If `BACKEND_ADMIN_PASSWORD_HASH` is not set, local admin defaults to `admin/admin`.
- In production, first local admin login with the default password is allowed but protected actions are blocked until password rotation.
- `POST /api/v1/admin/auth/change-password` rotates and persists `BACKEND_ADMIN_PASSWORD_HASH` in `.env`.
- Admin auth uses a separate HTTP-only cookie and is not tied to user/provider auth.
- Admin routes under `/api/v1/admin/*` are bootstrap-safe and can load without Postgres wiring, so runtime DB/auth settings can be configured before `DATABASE_URL` is set.
- Use `/admin/dashboard` for guided runtime setup; use `/admin/settings` for advanced editing.

Admin bootstrap behavior (legacy helper):

- `POST /api/v1/admin/bootstrap` is protected by `BACKEND_ADMIN_SETUP_PASSWORD` and does not require user sign-in.
- Bootstrap updates write `BACKEND_ADMIN_SETUP_PASSWORD` and `BACKEND_ADMIN_REQUIRED_EMAIL` into `.env`.
- This helper is optional and separate from local admin password authentication.

Example issuer config:

```json
[
  {
    "name": "auth0",
    "issuer": "https://your-tenant.us.auth0.com/",
    "audience": "https://api.openchat.local",
    "jwksUri": "https://your-tenant.us.auth0.com/.well-known/jwks.json",
    "tokenUse": "access",
    "requiredScopes": ["read:projects", "write:projects"],
    "claimMapping": {
      "email": "email",
      "name": "name",
      "orgId": "org_id",
      "roles": "roles",
      "permissions": "permissions"
    },
    "oidc": {
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "redirectUri": "http://localhost:3000/api/v1/auth/auth0/callback",
      "scopes": ["openid", "profile", "email"],
      "authorizationParams": {
        "audience": "https://api.openchat.local"
      },
      "registerParams": {
        "screen_hint": "signup"
      }
    }
  }
]
```

Clerk issuer example:

```json
[
  {
    "name": "clerk",
    "issuer": "https://YOUR_CLERK_FRONTEND_API",
    "audience": "https://api.openchat.local",
    "jwksUri": "https://api.clerk.com/v1/jwks",
    "tokenUse": "access",
    "oidc": {
      "clientId": "your-clerk-client-id",
      "clientSecret": "your-clerk-client-secret",
      "redirectUri": "http://localhost:3000/api/v1/auth/clerk/callback",
      "scopes": ["openid", "profile", "email"]
    }
  }
]
```

Use the exact `iss` claim from your Clerk session token for `issuer`.

## API endpoints (MVP)

- `GET /api/v1/health`
- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `GET /api/v1/me/avatar`
- `PUT /api/v1/me/avatar`
- `DELETE /api/v1/me/avatar`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id`
- `GET /api/v1/chats`
- `POST /api/v1/chats`
- `GET /api/v1/chats/:id`
- `POST /api/v1/chats/:id/messages`
- `POST /api/v1/chat/guest`
- `GET /api/v1/model-providers`
- `GET /api/v1/auth/providers`
- `GET /api/v1/auth/start?mode=login|register[&provider=name]`
- `GET /api/v1/auth/:provider/start?mode=login|register`
- `GET /api/v1/auth/:provider/callback`
- `POST /api/v1/auth/local/login`
- `POST /api/v1/auth/local/register`
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/change-password`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/session`
- `GET /api/v1/admin/api-keys`
- `PUT /api/v1/admin/api-keys`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/runtime-settings`
- `PUT /api/v1/admin/runtime-settings`
- `POST /api/v1/auth/logout`

Protected endpoints require:

- `Authorization: Bearer <access_token>`

For browser sessions, the backend also accepts an HTTP-only cookie session and resolves the principal from that cookie when the `Authorization` header is absent.

Interactive auth provider support:

- Any standards-compliant OIDC provider can be configured in `BACKEND_AUTH_ISSUERS`.
- Common production setups: Auth0, Clerk, Google Identity, Microsoft Entra ID (Azure AD), Okta, AWS Cognito, and Keycloak.
- Provider-specific behavior should be handled via `oidc.authorizationParams`, `oidc.loginParams`, and `oidc.registerParams`.

Chat behavior:

- `/` starts as a new empty chat draft.
- The first message creates a saved chat and navigates to `/c/:chatId`.
- Chat access is owner-scoped; non-owner or unknown chat IDs return not found.
- Model-provider selection can be admin-managed via site settings.
- Model/provider selection is in a dedicated box near the chat composer.
- OpenRouter model allowlists and daily role-based request limits are enforced server-side.
- Guest responses (when enabled) call live model providers but are not persisted.

## Current backend design

- `backend/domain`: entities/value types
- `backend/application`: use-cases
- `backend/ports`: contracts (auth, permissions, repositories, unit-of-work)
- `backend/adapters/auth`: JWT multi-issuer verification + principal mapping + JIT provisioning
- `backend/adapters/db/postgres`: repository implementation + migration
- `backend/adapters/db/convex`: in-memory fallback adapter used when `BACKEND_DB_ADAPTER=convex`
- `backend/transport/rest`: request pipeline + error mapping
- `backend/composition`: config loading + dependency wiring

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run preview` (build and run in local Workers runtime)
- `npm run deploy` (build and deploy to Cloudflare Workers)
- `npm run cf-typegen` (generate Wrangler env types)

## Cloudflare deployment (OpenNext)

This project targets Cloudflare Workers via OpenNext, not `@cloudflare/next-on-pages`.

1. Install dependencies:

```bash
npm install
```

2. Authenticate Wrangler:

```bash
npx wrangler login
```

3. (Optional) Generate Cloudflare binding types:

```bash
npm run cf-typegen
```

4. Preview locally in the Workers runtime:

```bash
npm run preview
```

5. Deploy to Cloudflare Workers:

```bash
npm run deploy
```

Cloudflare adapter/config files:

- `open-next.config.ts`
- `wrangler.toml`
