// NEXO 订阅保护：渲染进程与 MCP 都经 IPC 访问配置，在这里拦截能读出/改写 NEXO 订阅内容的调用。
export const NEXO_PROTECTED_MESSAGE = 'NEXO account configuration is protected'

export class NexoProtectedError extends Error {
  readonly code = 'NEXO_PROTECTED'
  constructor() {
    super(NEXO_PROTECTED_MESSAGE)
    this.name = 'NexoProtectedError'
  }
}

type Handler = (...args: never[]) => unknown

export interface NexoGuardContext {
  profileId: string
  /** 当前订阅是否为 NEXO 账户订阅 */
  isNexoActive: () => Promise<boolean>
  /** 该文件是否可能包含 NEXO 订阅内容（运行配置、订阅文件、代理集合缓存等） */
  isProtectedFile: (path: string) => Promise<boolean>
}

function idOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg
  if (arg && typeof arg === 'object' && 'id' in arg) return String((arg as { id: unknown }).id)
  return undefined
}

/** 运行配置只保留资源页需要的字段；节点、代理组、代理集合地址全部去掉。 */
export function redactRuntimeConfig(config: IMihomoConfig): IMihomoConfig {
  const providers = config['proxy-providers'] as Record<string, Record<string, unknown>> | undefined
  const redacted: Record<string, unknown> = {}
  if (config['rule-providers']) redacted['rule-providers'] = config['rule-providers']
  if (providers) {
    redacted['proxy-providers'] = Object.fromEntries(
      Object.entries(providers).map(([name, p]) => [name, { type: p.type }])
    )
  }
  return redacted as unknown as IMihomoConfig
}

export function guardNexoHandlers<T extends Record<string, Handler>>(
  handlers: T,
  ctx: NexoGuardContext
): T {
  const out: Record<string, Handler> = { ...handlers }
  const wrap = (name: string, check: (args: unknown[]) => Promise<void>): void => {
    const original = handlers[name] as unknown as ((...args: unknown[]) => unknown) | undefined
    if (!original) return
    out[name] = (async (...args: unknown[]) => {
      await check(args)
      return await original(...args)
    }) as unknown as Handler
  }
  const byId = async (args: unknown[]): Promise<void> => {
    if (idOf(args[0]) === ctx.profileId) throw new NexoProtectedError()
  }
  for (const name of [
    'getProfileStr',
    'setProfileStr',
    'addProfileItem',
    'updateProfileItem',
    'removeProfileItem'
  ]) {
    wrap(name, byId)
  }
  wrap('getRuntimeConfigStr', async () => {
    if (await ctx.isNexoActive()) throw new NexoProtectedError()
  })
  for (const name of ['getFileStr', 'setFileStr', 'convertMrsRuleset']) {
    wrap(name, async (args) => {
      if (typeof args[0] === 'string' && (await ctx.isProtectedFile(args[0]))) {
        throw new NexoProtectedError()
      }
    })
  }
  const getRuntimeConfig = handlers.getRuntimeConfig as unknown as
    (() => Promise<IMihomoConfig>) | undefined
  if (getRuntimeConfig) {
    out.getRuntimeConfig = (async () => {
      const config = await getRuntimeConfig()
      return (await ctx.isNexoActive()) ? redactRuntimeConfig(config) : config
    }) as unknown as Handler
  }
  return out as T
}
