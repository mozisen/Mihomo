# Frontend (Renderer) Guidelines

> Conventions for `src/renderer/` — the React UI of the NEXO Electron client.

NEXO is a slimmed-down fork of Clash Party aimed at ordinary users: login with a
妙妙屋X account, pick a node, connect. Advanced/pro tools (overrides, DNS/sniffer
pages, config editors, Sub-Store, plugins, themes, backups, updater) were removed
on purpose. **Do not re-add pro features or editing UI without an explicit request.**

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Pages, components, hooks, utils layout | Filled |
| [Component Guidelines](./component-guidelines.md) | HeroUI + Tailwind components, i18n | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Config contexts, SWR, IPC events | Filled |
| [State Management](./state-management.md) | Where state lives (main vs renderer) | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Lint/format/typecheck, tests, forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Global ambient types, shared modules | Filled |

## Pre-Development Checklist

- [ ] Read `AGENTS.md` / `CLAUDE.md` (commit + test rules, generated files).
- [ ] Does the change need main-process work? Then also read `../main/index.md`.
- [ ] Every user-visible string goes through `t()` and exists in all 5 locale files.
- [ ] Renderer talks to main only through `@renderer/utils/ipc` wrappers.

## Quality Check

- [ ] `pnpm run format:check && pnpm run lint:check && pnpm run typecheck`
- [ ] `npx vitest run` passes; new behaviour has a test.
- [ ] `npx electron-vite build` succeeds when imports/deps changed.
