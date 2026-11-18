// 账户页“网站测试”与“出口 IP 信息”：主进程与渲染进程共用的类型与常量。

export type SiteKey = 'apple' | 'github' | 'google' | 'youtube'

export const SITE_TARGETS: { key: SiteKey; name: string; url: string }[] = [
  { key: 'apple', name: 'Apple', url: 'https://www.apple.com/library/test/success.html' },
  { key: 'github', name: 'GitHub', url: 'https://github.com/robots.txt' },
  { key: 'google', name: 'Google', url: 'https://www.google.com/generate_204' },
  { key: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/generate_204' }
]

export interface ExitIpInfo {
  ip: string
  countryCode?: string
  country?: string
  asn?: number
  asOrganization?: string
  /** AS 域名（运营商网站域名） */
  asDomain?: string
  /** IP2Location 定位：国家, 地区, 城市 */
  ip2location?: string
  timezone?: string
  /** IP 来源：true 原生 IP，false 广播 IP */
  native?: boolean
  /** IP 属性：true 住宅 IP，false 机房 IP */
  residential?: boolean
  /** IPPure 系数 0–100，越低越纯净 */
  fraudScore?: number
}

/** IPPure 系数分段（与 ippure.com 刻度一致：0/15/25/40/50/70/100） */
export const FRAUD_SCORE_LEVELS = [
  { max: 15, key: 'veryClean', color: '#166534' },
  { max: 25, key: 'clean', color: '#22c55e' },
  { max: 40, key: 'fair', color: '#84cc16' },
  { max: 50, key: 'slightRisk', color: '#eab308' },
  { max: 70, key: 'highRisk', color: '#f97316' },
  { max: 100, key: 'veryHighRisk', color: '#dc2626' }
] as const

export function fraudScoreLevel(score: number): (typeof FRAUD_SCORE_LEVELS)[number] {
  return FRAUD_SCORE_LEVELS.find((l) => score < l.max) ?? FRAUD_SCORE_LEVELS[5]
}
