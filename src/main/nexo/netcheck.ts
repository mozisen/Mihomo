// 账户页的网站延迟测试与出口 IP 信息。所有请求都经 nexo 的 mixed-port 代理发出，
// 测到的是代理后的延迟与出口 IP。数据整理是纯函数，便于单元测试。
import type { ExitIpInfo, SiteKey } from '../../shared/netcheck'
import { SITE_TARGETS } from '../../shared/netcheck'

/** IPPure 公开接口：https://ippure.com/MyIP-Info-API.html */
export const IPPURE_INFO_URL = 'https://my.ippure.com/v1/info'
/** IP2Location 免 key 接口（每个 IP 每天 1000 次） */
export const IP2LOCATION_URL = 'https://api.ip2location.io/'
/** PeeringDB：按 ASN 查运营商网站，用作“AS 域名” */
export const PEERINGDB_NET_URL = 'https://www.peeringdb.com/api/net'

export interface IppureInfo {
  ip?: string
  asn?: number
  asOrganization?: string
  country?: string
  countryCode?: string
  region?: string
  city?: string
  timezone?: string
  fraudScore?: number
  isResidential?: boolean
  isBroadcast?: boolean
}

export interface Ip2LocationInfo {
  country_name?: string
  region_name?: string
  city_name?: string
}

export interface PeeringDbNet {
  data?: { website?: string }[]
}

/** 运营商网站 → 域名（去掉协议、路径与 www. 前缀）。 */
export function domainFromWebsite(website?: string): string | undefined {
  if (!website) return undefined
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname
    return host.replace(/^www\./i, '') || undefined
  } catch {
    return undefined
  }
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function buildExitIpInfo(
  ippure: IppureInfo,
  ip2location?: Ip2LocationInfo,
  peeringdb?: PeeringDbNet
): ExitIpInfo {
  const ip = text(ippure.ip)
  if (!ip) throw new Error('IPPure returned no IP')
  const location = ip2location
    ? [ip2location.country_name, ip2location.region_name, ip2location.city_name]
        .map(text)
        .filter((s): s is string => !!s)
        // 去掉重复（如 “Taiwan, Taiwan, Taichung”）
        .filter((s, i, all) => all.indexOf(s) === i)
    : []
  const score = Number(ippure.fraudScore)
  return {
    ip,
    countryCode: text(ippure.countryCode)?.toUpperCase(),
    country: text(ippure.country),
    asn: Number.isInteger(ippure.asn) ? ippure.asn : undefined,
    asOrganization: text(ippure.asOrganization),
    asDomain: domainFromWebsite(peeringdb?.data?.[0]?.website),
    ip2location: location.length ? location.join(', ') : undefined,
    timezone: text(ippure.timezone),
    native: typeof ippure.isBroadcast === 'boolean' ? !ippure.isBroadcast : undefined,
    residential: typeof ippure.isResidential === 'boolean' ? ippure.isResidential : undefined,
    fraudScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : undefined
  }
}

export interface NetcheckDeps {
  /** 经代理 GET，返回解析后的 JSON / 文本；失败时抛错 */
  get: (url: string, opts: { timeout: number; json: boolean }) => Promise<unknown>
  now?: () => number
}

/** 测一次网站延迟（毫秒）；超时或失败返回 null。 */
export async function measureSite(deps: NetcheckDeps, key: SiteKey): Promise<number | null> {
  const target = SITE_TARGETS.find((s) => s.key === key)
  if (!target) throw new Error(`unknown site ${key}`)
  const now = deps.now ?? Date.now
  const t0 = now()
  try {
    await deps.get(target.url, { timeout: 5000, json: false })
    return Math.max(1, now() - t0)
  } catch {
    return null
  }
}

/** 出口 IP 信息：IPPure 必须成功；IP2Location 与 AS 域名拿不到时留空。 */
export async function fetchExitIpInfo(deps: NetcheckDeps): Promise<ExitIpInfo> {
  const ippure = (await deps.get(IPPURE_INFO_URL, { timeout: 10000, json: true })) as IppureInfo
  const ip = text(ippure?.ip)
  if (!ip) throw new Error('IPPure returned no IP')
  const [loc, net] = await Promise.allSettled([
    deps.get(`${IP2LOCATION_URL}?ip=${encodeURIComponent(ip)}`, { timeout: 8000, json: true }),
    Number.isInteger(ippure.asn)
      ? deps.get(`${PEERINGDB_NET_URL}?asn=${ippure.asn}&fields=website`, {
          timeout: 8000,
          json: true
        })
      : Promise.reject(new Error('no asn'))
  ])
  return buildExitIpInfo(
    ippure,
    loc.status === 'fulfilled' ? (loc.value as Ip2LocationInfo) : undefined,
    net.status === 'fulfilled' ? (net.value as PeeringDbNet) : undefined
  )
}
