# Build & Packaging

- Dev: `pnpm dev`; bundle: `npx electron-vite build` (output in `out/`).
- `electron.vite.config.ts`: main/preload externalize `dependencies`; the renderer
  bundles everything it imports. So `dependencies` = packages the main process needs at
  runtime (they ship in `app.asar`); renderer-only packages go in `devDependencies`.
- `scripts/prepare.mjs` downloads sidecars/resources into `extra/` (generated — don't edit
  `extra/sidecar/`). Bundled geo data is only `country.mmdb`, `geoip.dat`, `geosite.dat`;
  ASN/metadb/BundleMRS are fetched by the core on demand. Three cores ship:
  mihomo, mihomo-alpha, mihomo-smart.
- `electron-builder.yml`: productName NEXO, appId `com.nexo.app`, artifacts `nexo-*`;
  no file associations.
- Windows CI: push `main:smart_core` to `mozisen/Mihomo`, then
  `gh workflow run build-windows.yml -R mozisen/Mihomo --ref smart_core -f arch=x64`;
  artifact "Windows x64" contains setup.exe and portable .7z (users want only setup.exe).
- Regression guards for packaging decisions: `src/main/brand.test.ts`.
