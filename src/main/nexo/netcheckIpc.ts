// 网站测试 / 出口 IP 的 IPC：用 Electron net 经 mixed-port 代理请求。
import { getControledMihomoConfig } from '../config'
import { get } from '../utils/chromeRequest'
import type { ExitIpInfo, SiteKey } from '../../shared/netcheck'
import { fetchExitIpInfo, measureSite, type NetcheckDeps } from './netcheck'

async function deps(): Promise<NetcheckDeps> {
  const { 'mixed-port': mixedPort = 7890 } = await getControledMihomoConfig()
  const proxy = mixedPort
    ? { protocol: 'http' as const, host: '127.0.0.1', port: mixedPort }
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
  return await fetchExitIpInfo(await deps())
}
