# State Management

| State | Where it lives | How the renderer reads it |
|-------|----------------|---------------------------|
| App settings (`IAppConfig`) | main: `config/app.ts` (YAML in data dir) | `useAppConfig()` |
| Mihomo overrides (`controledMihomo`) | main: `config/controledMihomo.ts` | `useControledMihomoConfig()` |
| Profiles / current profile | main: `config/profile.ts` | `useProfileConfig()` |
| NEXO account + subscription | main: `nexo/` (session encrypted with safeStorage) | `useNexoAccount()` |
| Live core data (groups, rules, connections) | mihomo core via `core/mihomoApi.ts` | `useGroups()`, `useRules()`, SWR |
| Pure UI state | component `useState` / `localStorage` (filters, expand state) | — |

Rules:

- Main process is the source of truth; the renderer never writes config files.
- The NEXO subscription is a `type: 'local'` profile with `nexo: true`, stored
  encrypted. It must run as-is: `isLocalProfile()` (`src/shared/local-config.ts`)
  excludes `nexo` items. Treating it as local runs the empty PROXY/DIRECT template.
- Subscription content/URLs must never reach the renderer — guarded by
  `nexo/ipcGuard.ts`; don't add IPC that returns profile text.
- No Redux/Zustand; React context + SWR only.
