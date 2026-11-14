# Hook Guidelines

## Config contexts

Main-process configs are exposed through providers built with
`hooks/create-config-context.tsx` (SWR key + fetcher + IPC refresh event):

- `use-app-config.tsx` → `{ appConfig, patchAppConfig, mutateAppConfig }`
- `use-controled-mihomo-config.tsx`, `use-profile-config.tsx`, `use-override-config.tsx`
- `use-groups.tsx`, `use-rules.tsx`, `use-nexo-account.tsx`

Pattern: patch through IPC, show the error, then `mutate()` in `finally`
(see `use-app-config.tsx`). Providers are nested in `main.tsx`; a hook used
outside its provider throws.

## Data fetching

- `useSWR('<ipcName>', ipcFn)` with the IPC function name as key.
- Refresh on main-process events: `useEffect(() => window.electron.ipcRenderer.on('xxxUpdated', () => void mutate()), [mutate])`
  — `on()` returns the unsubscribe function. The channel must be in the preload
  `validListenChannels` whitelist (`src/preload/index.ts`).

## Naming

`use-kebab-name.ts(x)` exporting `useCamelName`; `.tsx` only when the file renders a provider.
