# AGENTS.md

This file helps coding agents quickly understand and safely modify this repository.

## Project at a glance

- Name: `openchat`
- Type: Next.js App Router UI template
- Current state: single-page, static demo of an AI chat product interface (no backend/API wiring yet)
- Goal: provide a polished baseline chat experience that can be extended into a functional app

## Tech stack

- Framework: Next.js 16 + React 19
- Language: TypeScript
- Styling: Tailwind CSS v4 + custom CSS tokens in `app/globals.css`
- Linting: ESLint via `eslint-config-next`

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
- `public/*.svg`
  - Default static assets from scaffold.

## Runtime and scripts

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Lint: `npm run lint`
- Production build: `npm run build`
- Start production build: `npm run start`

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
- Avoid adding dependencies unless required for a clear feature.
- Run `npm run lint` after meaningful code changes.

## Safe extension points

- Add real chat state:
  - Move mock arrays in `app/page.tsx` into state/hooks.
  - Introduce message send/append flow.
- Add backend integration:
  - Create API route handlers under `app/api/*`.
  - Swap static data for fetched/session data.
- Improve component structure:
  - Extract large sections from `app/page.tsx` into reusable components under a new `components/` directory.

## Known limitations

- No authentication.
- No persistence or server communication.
- No tests yet.

When making major architectural changes, update this file so future agents inherit accurate context.
