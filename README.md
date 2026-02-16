# openchat

OpenChat is a Next.js chat product template with an in-progress REST backend scaffold.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4 for UI
- REST backend in App Router route handlers (`app/api/v1/*`)
- Auth verification with `jose` (OIDC/JWT, multi-issuer)
- Persistence adapters (Postgres/Neon implemented, Convex mode uses an in-memory adapter fallback)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values.
3. Run SQL migrations in `backend/adapters/db/postgres/migrations/001_initial.sql` and `backend/adapters/db/postgres/migrations/002_user_profile_avatar.sql`.
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
- `BACKEND_SESSION_SECRET`: required for cookie-session login/register flows (min 32 chars)
- `BACKEND_SESSION_COOKIE_NAME`: optional, default `openchat_session`
- `BACKEND_AUTH_FLOW_COOKIE_NAME`: optional, default `openchat_auth_flow`
- `BACKEND_SESSION_SECURE_COOKIES`: optional (`true`/`false`), defaults by `NODE_ENV`

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
- `GET /api/v1/auth/providers`
- `GET /api/v1/auth/:provider/start?mode=login|register`
- `GET /api/v1/auth/:provider/callback`
- `POST /api/v1/auth/logout`

Protected endpoints require:

- `Authorization: Bearer <access_token>`

For browser sessions, the backend also accepts an HTTP-only cookie session and resolves the principal from that cookie when the `Authorization` header is absent.

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
