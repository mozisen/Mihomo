// NEXO 账户错误 → 渲染进程可本地化的错误码与简短详情
export function errorCode(e: unknown): string {
  if (e && typeof e === 'object') {
    const { status, code, message } = e as { status?: number; code?: string; message?: string }
    if (status === 401) return 'INVALID_CREDENTIALS'
    if (status === 429) return 'RATE_LIMITED'
    if (code === 'cert_unavailable' || code === 'network') return 'MASTER_UNAVAILABLE'
    if (code?.startsWith('cert_')) return 'MASTER_UNTRUSTED'
    if (message === 'NO_SUBSCRIPTION') return 'NO_SUBSCRIPTION'
  }
  return 'UNKNOWN'
}

/** 错误详情：HTTP 状态与主控/本机给出的原因，不含令牌和订阅内容。 */
export function errorDetail(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e)
  const { name, status, code, message } = e as {
    name?: string
    status?: number
    code?: string
    message?: string
  }
  const parts = [status ? `HTTP ${status}` : code || name, message]
  return parts
    .filter(Boolean)
    .join(': ')
    .replace(/(token|mmwx_)[=:]?\s*[\w-]{8,}/gi, '$1…')
    .slice(0, 200)
}
