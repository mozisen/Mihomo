# Quality Guidelines

## Required before every commit (pre-commit hook enforces it)

```bash
pnpm run format:check && pnpm run lint:check && pnpm run typecheck
```

Never bypass hooks (`--no-verify` is forbidden). Fix with `npx eslint --fix` / `npx prettier --write`.

## Tests

- Vitest, `environment: 'node'`, files `src/**/*.test.{ts,tsx}`.
- Components are tested with `renderToStaticMarkup` and `vi.mock` for heavy children,
  i18n (`useTranslation: () => ({ t: (k) => k })`) and IPC — see `pages/settings.test.tsx`.
- Every change adds or updates tests; run `npx vitest run` before delivery.
- Regression tests for product decisions live in `src/main/brand.test.ts`
  (branding, no updater, no removed bundle resources, no Monaco).

## Forbidden / avoid

- Editing `pnpm-lock.yaml` by hand (use pnpm), `extra/sidecar/`, `node_modules/.temp/`.
- Re-adding removed pro features (see `index.md`) or big assets (Monaco, flag-icons,
  full-size PNG icons — default connection icons are 128px in `assets/default-icons.ts`).
- Renderer-only packages in `dependencies`: Vite bundles them, so they belong in
  `devDependencies`; `dependencies` are shipped again in `app.asar`.

## Accessibility

Icon-only buttons get `title` / `aria-label`; flags use `role="img"` + `aria-label`.
