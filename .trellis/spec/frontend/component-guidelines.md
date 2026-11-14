# Component Guidelines

## Structure

Function components typed as `React.FC<Props>`, default export, props interface
declared above. Example: `components/resources/proxy-provider.tsx`,
`components/rules/rule-item.tsx`.

```tsx
interface Props {
  connection: IMihomoConnectionDetail
  onClose: () => void
}

const ConnectionDetailModal: React.FC<Props> = ({ connection, onClose }) => { ... }
export default ConnectionDetailModal
```

## UI Kit & Styling

- HeroUI (`@heroui/react`) for controls: `Button`, `Card`, `Switch`, `Modal`, `Dropdown`, `Chip`...
- Tailwind utility classes for layout (`flex`, `gap-2`, `text-foreground-500`); no CSS modules.
- Settings screens use `SettingCard` + `SettingItem` (`components/base/base-setting-*`).
- Pages wrap content in `BasePage` (`components/base/base-page.tsx`) with `title` and optional `header`.
- Icons from `react-icons` (`md`, `io`, `bi`, `cg`, ...).
- Country flags: `countryFlagEmoji()` from `utils/flag.ts` + `.flag-emoji` class
  (do not add `flag-icons` back — it shipped 3.7 MB of SVGs).
- Text editing: `components/base/base-editor.tsx` is a plain `<textarea>`; Monaco was removed for size.

## i18n

Every user-visible string uses `const { t } = useTranslation()`; keys are flat
(`'resources.proxyProviders.title'`) and must exist in all 5 files under `locales/`.
When removing a feature, prune its keys with `scripts/brand/prune-locales.py <prefix>...`.
Hard-coded Chinese strings exist in a few legacy spots — don't add new ones.

## Error feedback

Use `toast.error(String(e))` (`components/base/toast`) or `showError` (`utils/error-display`);
never `alert()`.

## Common Mistakes

- Removing a component but leaving its i18n keys, IPC channel or preload whitelist entry.
- Re-introducing an "edit mode" on rules/proxies/resources — these pages are view-only now.
