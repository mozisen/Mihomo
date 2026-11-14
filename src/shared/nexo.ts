// NEXO 账户：主进程与渲染进程共用的状态类型
export interface NexoAccountInfo {
  username: string
  nickname?: string
  email?: string
  subscriptionName?: string
  trafficUsed?: number
  trafficTotal?: number
  /** Unix 秒；没有到期日时为空 */
  expire?: number
  /** 每月流量重置日（1–31）；主控暂未提供时为空 */
  resetDay?: number
  /** 当前在线 IP；主控暂未提供时为空 */
  onlineIps?: string[]
  lastSync?: number
}

export type NexoAccountState =
  | { status: 'loading' }
  | { status: 'loggedOut'; error?: string }
  | { status: 'needs2fa' }
  | {
      status: 'loggedIn'
      account: NexoAccountInfo
      syncing: boolean
      error?: string
    }

/** 主进程抛给渲染进程的错误码（错误消息形如 `NEXO:<code>`）。 */
export const NEXO_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'MASTER_UNAVAILABLE',
  'MASTER_UNTRUSTED',
  'NO_SUBSCRIPTION',
  'UNKNOWN'
] as const

export type NexoErrorCode = (typeof NEXO_ERROR_CODES)[number]

/** 从 IPC 错误中取出主控返回的错误详情（`NEXO:<code>|<detail>`），用于排查。 */
export function nexoErrorDetail(e: unknown): string | undefined {
  const message = e instanceof Error ? e.message : String(e ?? '')
  const match = /NEXO:[A-Z_]+\|(.+)$/s.exec(message)
  return match?.[1]?.trim() || undefined
}

/** 从 IPC 错误中取出 NEXO 错误码。 */
export function nexoErrorCode(e: unknown): NexoErrorCode {
  const message = e instanceof Error ? e.message : String(e ?? '')
  const match = /NEXO:([A-Z_]+)/.exec(message)
  const code = match?.[1] as NexoErrorCode | undefined
  return code && NEXO_ERROR_CODES.includes(code) ? code : 'UNKNOWN'
}
