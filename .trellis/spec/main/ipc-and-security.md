# IPC & Security

## Adding an IPC call

1. Implement in a main module; export it.
2. Register in the handler map in `src/main/utils/ipc.ts` (wrapped with `wrapAsync`,
   errors become `{ invokeError }`).
3. Add the channel to `validInvokeChannels` in `src/preload/index.ts`.
4. Add the signature to `IpcApi` and export the wrapper in `src/renderer/src/utils/ipc.ts`.

Events main → renderer: `mainWindow?.webContents.send('xxxUpdated')` and add the
channel to `validListenChannels`.

Removing a channel: `python3 scripts/brand/remove-ipc.py <name>...` edits all three files;
then delete leftover empty `import { } from` blocks and unused helpers it leaves behind.

## NEXO subscription protection

- Subscription content is encrypted at rest (`nexo/secretStore.ts`, Electron safeStorage).
- `nexo/ipcGuard.ts` blocks IPC that could read or rewrite the NEXO profile or files in
  its work dir (except rule-provider files). New IPC that reads profile/runtime files must
  be checked against the guard.
- Don't log tokens or subscription URLs; use `errorDetail()` from `nexo/errors.ts`.
- Never authenticate against the production master with a real user's password in
  automated tests; use `nexo/testMaster.ts`.
