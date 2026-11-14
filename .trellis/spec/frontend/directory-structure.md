# Directory Structure

```
src/renderer/
├── index.html, floating.html     # two entry points (main window, floating window)
└── src/
    ├── main.tsx                  # providers tree + LoginGate
    ├── App.tsx                   # layout: sider + routed page
    ├── routes/                   # index.tsx (route table), route-pages.tsx (lazy pages + preload)
    ├── pages/                    # one file per route: proxies, rules, connections, account, ...
    ├── components/
    │   ├── base/                 # shared building blocks (base-page, base-setting-card/item, toast, ...)
    │   ├── sider/                # sidebar cards (one *-card.tsx / *-switcher.tsx per card)
    │   ├── nexo/                 # account/login UI
    │   └── <feature>/            # connections, proxies, resources, settings, traffic, ...
    ├── hooks/                    # use-*.ts(x); config contexts built with create-config-context
    ├── utils/                    # ipc.ts (all IPC wrappers), sider.ts, tour.ts, helpers
    ├── locales/                  # en-US, zh-CN, zh-TW, ru-RU, fa-IR (flat key JSON)
    └── assets/                   # css, fonts (NotoColorEmoji for Windows flags), icons
```

## Conventions

- File names are kebab-case: `proxy-provider.tsx`, `use-app-config.tsx`.
- Pages are lazy-loaded via `createPreloadablePage` in `routes/route-pages.tsx`;
  adding/removing a page means editing both `route-pages.tsx` and `routes/index.tsx`
  (`scripts/brand/remove-route.py` automates removal).
- Sidebar cards: key in `SiderCardKey` (`src/shared/types.d.ts`), order in
  `DEFAULT_SIDER_ORDER` + sizes in `SIDER_CARD_DEFAULT_STATUS` (`src/shared/appConfig.ts`),
  route in `SIDER_CARD_ROUTES` (`utils/sider.ts`), component in `components/sider/sider-cards.tsx`.
  The order is fixed (no drag/hide settings); resources sits bottom-right next to usage.
- Tests live next to the code: `foo.ts` → `foo.test.ts`.
