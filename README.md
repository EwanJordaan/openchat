# openchat

OpenChat is a Next.js chat product template with an in-progress REST backend scaffold.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 for UI
- REST backend in App Router route handlers (`app/api/v1/*`)
- Auth verification with `jose` (OIDC/JWT, multi-issuer)
- Persistence adapters (Postgres/Neon implemented, Convex mode uses an in-memory adapter fallback)
- Central typed app config in `openchat.config.ts`

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values.
3. Run SQL migrations in `backend/adapters/db/postgres/migrations/001_initial.sql`, `backend/adapters/db/postgres/migrations/002_user_profile_avatar.sql`, `backend/adapters/db/postgres/migrations/003_chats.sql`, and `backend/adapters/db/postgres/migrations/004_external_identity_metadata.sql`.
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

Local admin password behavior:

- Local admin username is fixed to `admin`.
- If `BACKEND_ADMIN_PASSWORD_HASH` is not set, local admin defaults to `admin/admin`.
- In production, first local admin login with the default password is allowed but protected actions are blocked until password rotation.
- `POST /api/v1/admin/auth/change-password` rotates and persists `BACKEND_ADMIN_PASSWORD_HASH` in `.env`.
- Admin auth uses a separate HTTP-only cookie and is not tied to user/provider auth.

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
- `GET /api/v1/auth/start?mode=login|register`
- `GET /api/v1/auth/:provider/start?mode=login|register`
- `GET /api/v1/auth/:provider/callback`
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/change-password`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/session`
- `GET /api/v1/admin/api-keys`
- `PUT /api/v1/admin/api-keys`
- `GET /api/v1/admin/runtime-settings`
- `PUT /api/v1/admin/runtime-settings`
- `POST /api/v1/auth/logout`

Protected endpoints require:

- `Authorization: Bearer <access_token>`

For browser sessions, the backend also accepts an HTTP-only cookie session and resolves the principal from that cookie when the `Authorization` header is absent.

Interactive auth provider support:

- Any standards-compliant OIDC provider can be configured in `BACKEND_AUTH_ISSUERS`.
- Common production setups: Auth0, Google Identity, Microsoft Entra ID (Azure AD), Okta, AWS Cognito, and Keycloak.
- Provider-specific behavior should be handled via `oidc.authorizationParams`, `oidc.loginParams`, and `oidc.registerParams`.

Chat behavior:

- `/` starts as a new empty chat draft.
- The first message creates a saved chat and navigates to `/c/:chatId`.
- Chat access is owner-scoped; non-owner or unknown chat IDs return not found.
- You can choose a model provider in Settings and in the chat header.
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
