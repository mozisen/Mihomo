# Architecture

```
src/main/
├── index.ts          # app bootstrap, single-instance, deep links (clash:// / mihomo:// install-config)
├── window.ts, lifecycle.ts
├── config/           # app.ts, controledMihomo.ts, profile.ts, override.ts (YAML stores, cached)
├── core/             # manager.ts (start/stop mihomo), factory.ts (build runtime config),
│                     # mihomoApi.ts (REST/WS client), profileUpdater.ts (cron/interval)
├── nexo/             # 妙妙屋X account: client.ts (encrypted RPC), accountService.ts,
│                     # account.ts (wiring + IPC), secureChannel.ts, secretStore.ts, ipcGuard.ts
├── local/            # local-profile compiler (legacy; no editor UI any more)
├── resolve/          # tray, floating window, shortcuts, PAC server, traffic monitor
├── sys/              # sysproxy, autorun, misc OS integration
├── traffic/          # traffic usage database
└── utils/            # ipc.ts, dirs.ts, init.ts (startup + migrations), logger.ts, safeFile.ts
```

## Runtime config flow

`core/factory.ts#generateProfile()` reads the current profile item:
- `isLocalProfile(item)` → `compileLocalRuntime()` (local editor store);
- otherwise `getProfile(id)` (decrypts the NEXO profile when needed),
then merges `controledMihomo` settings, DNS guard, overrides and writes the runtime YAML.

## NEXO account

- `accountService.sync()` → profile + subscriptions + token → `downloadSubscription()`
  → `upsertNexoProfile()` (validate, encrypt, set current, hot-reload).
- Master: `https://mx.voee.de`; UA `mihomo/1.19 NEXO/<version>`; ChaCha20-Poly1305 via
  `@noble/ciphers` (Electron's BoringSSL lacks it — never switch back to node:crypto).
- Clock skew is corrected from the server `Date` header.

## Startup migrations

Add idempotent `migrateXxx()` functions to `utils/init.ts#migration()`
(e.g. `migrateSiderLayout` resets saved sidebar order/sizes to the fixed layout).

## Logging & files

- `createLogger('<module>')` from `utils/logger.ts`.
- Write files with `atomicWriteFile` (`utils/safeFile.ts`); paths from `utils/dirs.ts`.
