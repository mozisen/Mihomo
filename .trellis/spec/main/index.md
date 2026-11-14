# Main Process Guidelines

> Conventions for `src/main/` (Electron main) and `src/preload/`.

| Guide | Description | Status |
|-------|-------------|--------|
| [Architecture](./architecture.md) | Module layout, config/profile flow, core lifecycle | Filled |
| [IPC & Security](./ipc-and-security.md) | Adding/removing IPC, NEXO subscription protection | Filled |
| [Build & Packaging](./build-and-packaging.md) | electron-vite, prepare.mjs, electron-builder, CI | Filled |

## Pre-Development Checklist

- [ ] Read `../frontend/state-management.md` if the change crosses into the UI.
- [ ] New IPC? Update main handler map, preload whitelist and renderer `IpcApi` together.
- [ ] Touching profiles/subscriptions? Keep the NEXO profile encrypted and runnable as-is.

## Quality Check

- [ ] `pnpm run typecheck` (node + web + tests projects) and `npx vitest run`.
- [ ] No secrets/tokens in logs (`nexo/errors.ts` redacts details).
