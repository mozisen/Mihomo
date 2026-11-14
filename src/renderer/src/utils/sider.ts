import { DEFAULT_SIDER_ORDER } from '../../../shared/appConfig'

// NEXO 定制：侧边栏卡片顺序固定，不再支持拖拽排序或隐藏。
export const SIDER_CARD_KEYS: readonly SiderCardKey[] = DEFAULT_SIDER_ORDER

export const SIDER_CARD_ROUTES: Record<SiderCardKey, string> = {
  sysproxy: '/sysproxy',
  tun: '/tun',
  profile: '/account',
  proxy: '/proxies',
  rule: '/rules',
  resource: '/resources',
  connection: '/connections',
  mihomo: '/mihomo',
  log: '/logs',
  network: '/network',
  usage: '/traffic'
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
