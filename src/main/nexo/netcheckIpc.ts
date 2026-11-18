// 网站测试 / 出口 IP 的 IPC：用 Electron net 经 mixed-port 代理请求。
import { getControledMihomoConfig } from '../config'
import { get } from '../utils/chromeRequest'
import { activeExitListener } from '../core/exitListener'
import type { ExitIpInfo, SiteKey } from '../../shared/netcheck'
import { fetchExitIpInfo, measureSite, type NetcheckDeps } from './netcheck'

/**
 * exit=true：走“节点选择”专用入站，查到的是节点的出口 IP；内核配置里没有该入站
 * （没有 select 策略组）时退回 mixed-port。网站测试按分流规则走 mixed-port，反映实际使用。
 */
async function deps(exit = false): Promise<NetcheckDeps> {
  const listener = exit ? activeExitListener() : undefined
  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  const proxyPort = listener?.port ?? mixedPort
  const proxy = proxyPort
    ? { protocol: 'http' as const, host: '127.0.0.1', port: proxyPort }
    : false
  return {
    get: async (url, { timeout, json }) =>
      (
        await get<unknown>(url, {
          proxy,
          timeout,
          responseType: json ? 'json' : 'text',
          headers: { 'User-Agent': 'nexo' }
        })
      ).data
  }
}

export async function nexoSiteLatency(key: SiteKey): Promise<number | null> {
  return await measureSite(await deps(), key)
}

export async function nexoExitIpInfo(): Promise<ExitIpInfo> {
  return await fetchExitIpInfo(await deps(true))
}
