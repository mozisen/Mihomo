import type { NexoAccountInfo } from '../../../shared/nexo'
import { calcTraffic } from './calc'

export interface NexoAccountView {
  displayName: string
  used?: string
  remaining?: string
  total?: string
  /** 已用百分比 0–100；不限量或未知时为空 */
  percent?: number
  unlimited: boolean
  /** YYYY-MM-DD */
  expire?: string
  /** 下次重置日期 YYYY-MM-DD */
  reset?: string
  onlineIps?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 按每月重置日推算下一次重置日期（当月没有该日时取月末）。 */
export function nextResetDate(resetDay: number, now: Date): Date {
  const candidate = (year: number, month: number): Date => {
    const last = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(resetDay, last))
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisMonth = candidate(now.getFullYear(), now.getMonth())
  return thisMonth > today ? thisMonth : candidate(now.getFullYear(), now.getMonth() + 1)
}

export function buildAccountView(account: NexoAccountInfo, now = new Date()): NexoAccountView {
  const { trafficUsed, trafficTotal } = account
  const unlimited = trafficTotal === 0 && trafficUsed !== undefined
  const hasTotal = trafficTotal !== undefined && trafficTotal > 0
  const view: NexoAccountView = {
    displayName: account.nickname || account.username,
    unlimited
  }
  if (trafficUsed !== undefined) view.used = calcTraffic(trafficUsed)
  if (hasTotal) {
    view.total = calcTraffic(trafficTotal)
    view.remaining = calcTraffic(Math.max(0, trafficTotal - (trafficUsed ?? 0)))
    view.percent = Math.min(100, Math.round(((trafficUsed ?? 0) / trafficTotal) * 100))
  }
  if (account.expire) view.expire = ymd(new Date(account.expire * 1000))
  if (account.resetDay && account.resetDay >= 1 && account.resetDay <= 31) {
    view.reset = ymd(nextResetDate(account.resetDay, now))
  }
  if (account.onlineIps?.length) view.onlineIps = account.onlineIps.join(', ')
  return view
}
