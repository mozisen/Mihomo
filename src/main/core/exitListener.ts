// 出口 IP 检测专用入站：在写给内核的配置里加一个只监听本机的 mixed 入站，
// 流量固定走“节点选择”策略组，不受分流规则影响（否则查 IP 的网站可能被规则直连）。
import { createServer } from 'net'

export const EXIT_LISTENER_NAME = 'nexo-exit-check'

interface ProxyGroupLike {
  name?: unknown
  type?: unknown
}

/** 找“节点选择”：名称含“节点选择” → 名称像代理选择的 select 组 → 第一个 select 组。 */
export function pickExitGroup(profile: { 'proxy-groups'?: unknown }): string | undefined {
  const groups = (Array.isArray(profile['proxy-groups']) ? profile['proxy-groups'] : []).filter(
    (g): g is { name: string; type?: unknown } =>
      !!g && typeof (g as ProxyGroupLike).name === 'string'
  )
  const select = groups.filter((g) => g.type === 'select')
  return (
    groups.find((g) => g.name.includes('节点选择'))?.name ??
    select.find((g) => /节点|代理|proxy|select/i.test(g.name))?.name ??
    select[0]?.name
  )
}

/** 给内核配置加上检测入站；没有可用策略组时不加，返回实际使用的组名。 */
export function injectExitListener(
  profile: Record<string, unknown>,
  port: number
): string | undefined {
  const group = pickExitGroup(profile)
  if (!group || !port) return undefined
  const existing = Array.isArray(profile.listeners) ? profile.listeners : []
  profile.listeners = [
    ...existing.filter((l) => (l as { name?: unknown })?.name !== EXIT_LISTENER_NAME),
    { name: EXIT_LISTENER_NAME, type: 'mixed', port, listen: '127.0.0.1', proxy: group }
  ]
  return group
}

let port: number | undefined
let activeGroup: string | undefined

/** 本次运行固定使用一个空闲端口。 */
export async function exitListenerPort(): Promise<number> {
  if (port) return port
  port = await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })
  return port
}

export function setActiveExitGroup(group: string | undefined): void {
  activeGroup = group
}

/** 当前内核配置里检测入站的端口与策略组；没有时返回 undefined。 */
export function activeExitListener(): { port: number; group: string } | undefined {
  return port && activeGroup ? { port, group: activeGroup } : undefined
}
