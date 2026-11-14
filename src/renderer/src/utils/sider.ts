import { DEFAULT_SIDER_ORDER } from '../../../shared/appConfig'

// NEXO 定制：这些卡片在侧边栏和“侧边栏设置”中都不显示，对应页面不再有入口。
export const HIDDEN_SIDER_CARDS: readonly SiderCardKey[] = ['override', 'dns', 'sniff', 'substore']

export function isSiderCardHidden(key: string): boolean {
  return HIDDEN_SIDER_CARDS.includes(key as SiderCardKey)
}

export const SIDER_CARD_KEYS: SiderCardKey[] = DEFAULT_SIDER_ORDER.filter(
  (key) => !isSiderCardHidden(key)
)

export const SIDER_CARD_ROUTES: Record<SiderCardKey, string> = {
  sysproxy: '/sysproxy',
  tun: '/tun',
  profile: '/account',
  proxy: '/proxies',
  rule: '/rules',
  resource: '/resources',
  override: '/override',
  connection: '/connections',
  mihomo: '/mihomo',
  dns: '/dns',
  sniff: '/sniffer',
  log: '/logs',
  substore: '/substore',
  network: '/network',
  usage: '/traffic'
}

export function mergeSiderOrder(saved: string[] = []): SiderCardKey[] {
  const valid = saved.filter((key): key is SiderCardKey =>
    SIDER_CARD_KEYS.includes(key as SiderCardKey)
  )
  const missing = SIDER_CARD_KEYS.filter((key) => !valid.includes(key))
  return [...valid, ...missing]
}

export function getSiderCardRoute(card?: string): string {
  if (!card || !SIDER_CARD_KEYS.includes(card as SiderCardKey)) {
    return SIDER_CARD_ROUTES.proxy
  }
  return SIDER_CARD_ROUTES[card as SiderCardKey]
}

export function getSiderCardByPath(pathname: string): SiderCardKey | undefined {
  return SIDER_CARD_KEYS.find((key) => SIDER_CARD_ROUTES[key] === pathname)
}
