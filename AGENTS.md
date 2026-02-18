# AGENTS.md

This file helps coding agents quickly understand and safely modify this repository.

## Project at a glance

- Name: `openchat`
- Type: Next.js App Router app with UI + REST backend scaffold
- Current state: polished frontend demo plus backend MVP architecture (multi-issuer auth + adapter-based data layer), with login/register, account settings/profile avatar flows, and persisted owner-scoped chats
- Goal: provide a baseline chat experience with portable backend foundations (Auth + DB adapters)

## Tech stack

- Framework: Next.js 16 + React 19
- Language: TypeScript
- Styling: Tailwind CSS v4 + custom CSS tokens in `app/globals.css`
- Linting: ESLint via `eslint-config-next`
- Backend auth/JWT: `jose`
- Backend Postgres driver: `pg`
- Runtime config validation: `zod`

## Code map

- `app/layout.tsx`
  - App shell and global font setup.
  - Metadata (`title`, `description`).
- `app/globals.css`
  - Design tokens (colors, text, accents).
  - Surface styles, ambient effects, and message animations.
- `app/page.tsx`
  - Main template UI.
  - In-file mock data for conversations/messages/suggestions/tools.
  - Sidebar, chat stream, composer, and right context panel.
- `app/settings/page.tsx`
  - Authenticated account settings UI.
  - Profile editing, avatar upload/remove, session/provider details.
- `app/api/v1/*`
  - MVP REST routes (`health`, `me`, `projects`, `chats`, `auth`).
- `backend/domain/*`
  - Core backend entities (`Principal`, `User`, `Project`).
- `backend/application/*`
  - Use-cases (`GetCurrentUser`, `ListProjects`, `CreateProject`, `GetProjectById`, chat list/get/create/append).
- `backend/ports/*`
  - Contracts for auth context, permission checking, repositories, and unit-of-work.
- `backend/adapters/auth/*`
  - Multi-issuer JWT verification, claim mapping, and JIT user provisioning.
- `backend/adapters/db/postgres/*`
  - Postgres repositories, transaction unit-of-work, SQL migrations.
- `backend/adapters/db/convex/*`
  - In-memory fallback adapter used when `BACKEND_DB_ADAPTER=convex`.
- `backend/transport/rest/*`
  - Request pipeline helpers and consistent API error mapping.
- `backend/composition/*`
  - Config parsing and dependency container wiring.
- `public/*.svg`
  - Default static assets from scaffold.

## Runtime and scripts

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Lint: `npm run lint`
- Production build: `npm run build`
- Start production build: `npm run start`

## Backend runtime configuration

- Copy `.env.example` to `.env`.
- `BACKEND_DB_ADAPTER` supports `postgres` or `convex`.
  - Use `postgres` for both local Postgres and Neon.
  - `convex` currently maps to an in-memory fallback adapter for local/dev portability.
- For Postgres/Neon mode set:
  - `BACKEND_DB_ADAPTER=postgres`
  - `DATABASE_URL=<postgres connection string>`
- Auth issuer config:
- `BACKEND_AUTH_ISSUERS` as JSON array.
  - each item supports:
    - `name`
    - `issuer`
    - `audience` (string or string[])
    - `jwksUri`
    - optional: `tokenUse` (`access` | `id` | `any`), `algorithms`, `requiredScopes`, `claimMapping`.
    - optional for browser auth flows: `oidc.clientId`, `oidc.clientSecret`, `oidc.redirectUri`, `oidc.scopes`, `oidc.authorizationParams`, `oidc.loginParams`, `oidc.registerParams`.
- Clock skew:
  - `BACKEND_AUTH_CLOCK_SKEW_SECONDS` (default `60`, allowed `0-300`).
- Default interactive auth provider:
  - `BACKEND_AUTH_DEFAULT_PROVIDER` (optional provider `name`; used by `/api/v1/auth/start`).
- Cookie session config:
  - `BACKEND_SESSION_SECRET` (required for login/register flows, min 32 chars)
  - `BACKEND_SESSION_COOKIE_NAME` (default `openchat_session`)
  - `BACKEND_AUTH_FLOW_COOKIE_NAME` (default `openchat_auth_flow`)
  - `BACKEND_SESSION_SECURE_COOKIES` (`true`/`false`, defaults by environment)
- Local admin password auth:
  - local admin username is fixed to `admin`
  - `BACKEND_ADMIN_COOKIE_NAME` (default `openchat_admin_session`)
  - `BACKEND_ADMIN_PASSWORD_HASH` (optional `pbkdf2_sha512$...`)
  - if hash is missing, local admin defaults to `admin/admin`
  - in production, default password login is allowed once but protected actions require immediate password change
- Optional model provider API keys:
  - `OPENROUTER_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

### Auth0 issuer example

Use this shape in `BACKEND_AUTH_ISSUERS`:

```json
[
  {
    "name": "auth0",
    "issuer": "https://YOUR_TENANT.us.auth0.com/",
    "audience": "https://api.openchat.local",
    "jwksUri": "https://YOUR_TENANT.us.auth0.com/.well-known/jwks.json",
    "tokenUse": "access"
  }
]
```

Auth0 requirements:

- Create an Auth0 API and use its identifier as `audience`.
- Use RS256 signing in Auth0.
- Keep `issuer` exact (usually includes trailing slash).
- Send `Authorization: Bearer <access_token>` to protected endpoints.

## Database migration

- Apply `backend/adapters/db/postgres/migrations/001_initial.sql` before using protected endpoints.
- Apply `backend/adapters/db/postgres/migrations/002_user_profile_avatar.sql` for account avatar support.
- Apply `backend/adapters/db/postgres/migrations/003_chats.sql` for persisted chats/messages.
- Apply `backend/adapters/db/postgres/migrations/004_external_identity_metadata.sql` for persisted provider identity metadata.
- Neon uses the same schema/queries as local Postgres (swap only `DATABASE_URL`).

## MVP API routes

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

Notes:

- `/health` is public.
- `/me` and `/projects*` require Bearer JWT.
- Protected requests run JIT user provisioning keyed by `(issuer, subject)`.
- Browser requests can authenticate via signed HTTP-only cookie session (fallback when `Authorization` header is absent).
- Admin settings use a separate local admin cookie session (not tied to provider auth).
- `/login` and `/register` auto-start auth using `BACKEND_AUTH_DEFAULT_PROVIDER` (or first interactive provider).

## Bring-up checklist (what must work)

1. `npm install`
2. `.env` configured (DB + `BACKEND_AUTH_ISSUERS`)
3. Migration applied (`001_initial.sql`)
4. `npm run dev`
5. `GET /api/v1/health` returns `200`
6. `GET /api/v1/me` with valid Auth0 access token returns `200`
7. `GET /api/v1/projects` with same token returns `200`

## Request pipeline

1. Parse request
2. Verify Bearer JWT via `JwtMultiIssuerVerifier` (or resolve access token from signed session cookie)
3. Map token to normalized `Principal`
4. JIT find/create local user by `(issuer, subject)`
5. Permission check via `PermissionChecker`
6. Execute use-case (with `UnitOfWork` when needed)
7. Return consistent JSON response (with `x-request-id`)

## How the UI is organized

- `page.tsx` declares data arrays first, then icon helpers, then the `Home` component.
- The layout has three major regions:
  - Left sidebar: workspace and conversation list.
  - Center: active chat thread + composer.
  - Right sidebar: session/tool metadata cards.
- All content is currently mock data and not persisted.

## Conventions for future agent edits

- Keep edits scoped; avoid unrelated refactors.
- Prefer existing design tokens from `app/globals.css` over hard-coded colors.
- Preserve responsive behavior (`md`, `sm`, `xl` breakpoints already in use).
- Keep TypeScript types explicit for UI data structures.
- Keep backend business logic in `backend/application` and avoid transport/DB coupling there.
- Keep adapter boundaries intact (ports interfaces are the contract).
- Do not add IdP-specific checks in use-cases; normalize in auth adapters.
- Do not add Neon-specific SQL branches; Neon shares Postgres adapter.
- Avoid adding dependencies unless required for a clear feature.
- Run `npm run lint` after meaningful code changes.

## Safe extension points

- Add real chat state:
  - Move mock arrays in `app/page.tsx` into state/hooks.
  - Introduce message send/append flow.
- Add backend integration:
  - Add/extend API route handlers under `app/api/v1/*`.
  - Keep route handlers thin and call backend use-cases.
  - Add more repositories under `backend/ports` first, then implement adapters.
- Add auth providers:
  - Add issuer entries in `BACKEND_AUTH_ISSUERS`.
  - Reuse `JwtMultiIssuerVerifier` + issuer-specific claim mapping.
- Add Convex support:
  - Implement `backend/adapters/db/convex/*` against existing repository ports.
- Add repository contract tests:
  - Run the same test suite against Postgres and Convex adapters.
- Improve component structure:
  - Extract large sections from `app/page.tsx` into reusable components under a new `components/` directory.

## Known limitations

- Assistant replies are still temporary placeholder responses (persisted to chat history).
- Convex mode is an in-memory fallback adapter (not a persisted Convex backend).
- No repository contract tests yet.
- No rate limiting/audit logging/idempotency yet.

## Troubleshooting

- `401 unknown_issuer`: `iss` in token does not match configured `issuer`.
- `401 invalid_claims`: `audience` mismatch.
- `401 invalid_signature`: wrong JWKS URL or wrong tenant.
- startup error about `DATABASE_URL`: set `BACKEND_DB_ADAPTER=postgres` with a valid connection string.
- first protected call fails due to missing tables: apply migration `001_initial.sql`.

When making major architectural changes, update this file so future agents inherit accurate context.
