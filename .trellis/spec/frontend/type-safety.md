# Type Safety

- Global ambient types (`IAppConfig`, `IProfileItem`, `IMihomo*`, `SiderCardKey`, ...)
  are declared in `src/shared/types.d.ts` and used without imports in main and renderer.
- Shared runtime code/constants go in `src/shared/*.ts` (e.g. `appConfig.ts`,
  `local-config.ts`, `nexo.ts`) and are imported by relative path.
- IPC is typed once in the `IpcApi` interface in `src/renderer/src/utils/ipc.ts`;
  main handlers are registered by name in `src/main/utils/ipc.ts` and whitelisted in
  `src/preload/index.ts`. Keep the three in sync (`scripts/brand/remove-ipc.py` removes all three).
- IPC errors come back as `{ invokeError }` and are rethrown by `checkIpcError`.
- `strict` TS with `noUnusedLocals`; `any` only with an eslint-disable comment and a reason.
- Use `satisfies` for constant tables (see `SIDER_CARD_DEFAULT_STATUS`).
