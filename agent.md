# Agent Working Notes

## Tooling Rules
- Always use `bun` for package management and scripts.
- Prefer `bun run <script>` over `npm run <script>`.
- After code changes, run at least:
  - `bun run typecheck`
  - `bun run lint`

## Git Hygiene
- Use git continuously while working, not just at the end.
- Check status often with `git status --short`.
- Review focused changes with `git diff -- <file>` after each meaningful edit.
- Keep commits small and scoped when asked to commit.

## Known Pain Points (and Fixes)
- **Composer/input vertical centering can look wrong** when JS autosize logic and CSS height rules fight each other.
  - Fix: let one source of truth control height (prefer JS autosize for expanded mode), and avoid conflicting fixed-height CSS in that same mode.
- **Composer expand/collapse can flicker** when wrap detection changes layout width and then un-triggers itself.
  - Fix: avoid self-cancelling thresholds, or keep a stable mode (e.g., always expanded) when product direction is clear.
- **UI looked unchanged after edits** due to targeting the wrong selector/state.
  - Fix: verify actual runtime class names first (e.g., `.composer.expanded` vs base `.composer`), then style the active state.

## Quick Future Workflow
1. `git status --short`
2. Make small edit
3. `git diff -- <changed-file>`
4. `bun run typecheck && bun run lint`
5. Repeat until clean
