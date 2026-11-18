# Build & Packaging

- Dev: `pnpm dev`; bundle: `npx electron-vite build` (output in `out/`).
- `electron.vite.config.ts`: main/preload externalize `dependencies`; the renderer
  bundles everything it imports. So `dependencies` = packages the main process needs at
  runtime (they ship in `app.asar`); renderer-only packages go in `devDependencies`.
- `scripts/prepare.mjs` downloads sidecars/resources into `extra/` (generated — don't edit
  `extra/sidecar/`). Bundled geo data is only `country.mmdb`, `geoip.dat`, `geosite.dat`;
  ASN/metadb/BundleMRS are fetched by the core on demand. Three cores ship:
  mihomo, mihomo-alpha, mihomo-smart.
- `electron-builder.yml`: productName `nexo` (lower case everywhere: install dir, exe,
  shortcuts, UI), appId `com.nexo.app`, artifacts `nexo-*`;
  no file associations.
- Windows CI: push `main:smart_core` to `mozisen/Mihomo`, then
  `gh workflow run build-windows.yml -R mozisen/Mihomo --ref smart_core -f arch=x64`;
  artifact "Windows x64" contains setup.exe and portable .7z (users want only setup.exe).
- Regression guards for packaging decisions: `src/main/brand.test.ts`.

## Releases and auto update

- Every change that reaches the user is a release: bump the patch version in
  `package.json`, commit, push, build on CI, then publish to ECHO with
  `scripts/release-echo.sh <artifact dir> "<notes>"`.
- ECHO (`termark` asset `ECHO`, also reverse-proxies mx.voee.de) serves
  `https://echo.voee.de/nexo/` from `/srv/nexo-updates/nexo` via
  `/etc/nginx/conf.d/echo.voee.de.conf`; Let's Encrypt cert renews with certbot.timer.
- `latest.json`: `{ version, notes, releasedAt, assets: { win32: { x64: { file, sha256, size } } } }`.
  The script uploads the installer first and swaps `latest.json` last; keeps 3 installers.
- Client: `src/main/nexo/updater.ts` (pure, tested) + `update.ts` (Electron glue). Checks
  once per launch after the account is logged in (packaged Windows builds only), asks
  with a native dialog, verifies size + SHA-256, opens the installer with
  `shell.openPath` (UAC) and quits. Installers are accepted only from that directory.
- Never call `patchControledMihomoConfig` (or anything that hot-patches the core) from
  `initBasic()`/`migration()`: they run before `app.whenReady`, the patch tries to restart
  the core and startup hangs before IPC handlers are registered — the window stays blank
  (shipped in 1.0.2). One-off defaults go in `applyNexoDefaultsAfterCoreStart()`.
- Before publishing, smoke-test the built app: `npx electron-vite build`, run Electron
  with `--remote-debugging-port`, and check the page text via CDP and that the log has no
  "No handler registered".

### Update prompt UI

- Do not use `dialog.showMessageBox` for updates. `src/main/nexo/updatePrompt.ts` holds the state
  (`idle | available | downloading | error`, type in `src/shared/update.ts`) and pushes it on the
  `nexoUpdateState` channel; `components/nexo/update-modal.tsx` (mounted in `App.tsx`) renders it
  with HeroUI. The renderer pulls `nexoGetUpdateState` on mount in case the prompt fired before the
  window existed (silent start). Answers go back via `nexoUpdateRespond` / `nexoUpdateDismiss`.

### Exit IP check

- `factory.ts` injects a local mixed listener (`nexo-exit-check`, `proxy: <节点选择 group>`) so the
  account page's exit IP reflects the selected node, not whatever the rules route ippure.com to.

### Admin rights without repeated UAC (Windows)

- `src/main/sys/elevatedLaunch.ts`: when running elevated, register the on-demand scheduled task
  `nexo-elevated` (RunLevel HighestAvailable, arg `--nexo-elevated`) and write
  `<dataDir>/elevated-task.json` with the exe path. A later non-elevated launch runs
  `schtasks /run /tn nexo-elevated` **before** `requestSingleInstanceLock()` and `process.exit(0)`s.
- Guards: never relaunch when already elevated, when `--nexo-elevated` is present (standard users
  stay unelevated instead of looping), when argv carries a deep link, or when the marker's exe path
  differs from the current one.
- The NSIS uninstaller deletes the task unless `${isUpdated}` (so updates keep the grant).
