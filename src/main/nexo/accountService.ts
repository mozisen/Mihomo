// NEXO 账户：登录妙妙屋X、保持在线、自动更新绑定的订阅。依赖全部注入，便于单元测试。
import {
  MasterApiError,
  pickSubscription,
  type LoginSuccess,
  type MasterClient,
  type MasterSubscription,
  type SubscriptionUserInfo
} from './client'

export const NEXO_PROFILE_ID = 'nexo'

/** 加密保存在本机的会话（长期有效的个人 API 令牌，退出登录时吊销）。 */
export interface NexoSession {
  username: string
  apiToken: string
  tokenName: string
  account?: NexoAccountInfo
}

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
  | { status: 'loggedOut'; error?: string }
  | { status: 'needs2fa' }
  | {
      status: 'loggedIn'
      account: NexoAccountInfo
      syncing: boolean
      error?: string
    }

export interface NexoAccountDeps {
  client: MasterClient
  deviceName: () => string
  loadSession: () => Promise<NexoSession | undefined>
  saveSession: (session: NexoSession) => Promise<void>
  clearSession: () => Promise<void>
  /** 校验并以加密形式写入订阅，然后让内核使用它 */
  applyProfile: (content: string) => Promise<void>
  /** 删除 NEXO 订阅（退出登录 / 会话失效） */
  removeProfile: () => Promise<void>
  onChange?: (state: NexoAccountState) => void
  now?: () => number
  log?: { info: (msg: string) => void; warn: (msg: string, e?: unknown) => void }
}

export class NexoAccountService {
  private session?: NexoSession
  private pending2fa?: string
  private state: NexoAccountState = { status: 'loggedOut' }
  private syncPromise?: Promise<void>

  constructor(private readonly deps: NexoAccountDeps) {}

  getState(): NexoAccountState {
    return this.state
  }

  private setState(state: NexoAccountState): void {
    this.state = state
    this.deps.onChange?.(state)
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** 应用启动：有会话就直接视为已登录并在后台更新配置；没有会话就确保不残留 NEXO 订阅。 */
  async init(): Promise<void> {
    this.session = await this.deps.loadSession()
    if (!this.session) {
      await this.deps.removeProfile()
      this.setState({ status: 'loggedOut' })
      return
    }
    this.setState({
      status: 'loggedIn',
      account: this.session.account ?? { username: this.session.username },
      syncing: true
    })
    void this.sync().catch(() => {})
  }

  async login(username: string, password: string): Promise<NexoAccountState> {
    const result = await this.deps.client.login(username.trim(), password)
    if (result.kind === '2fa') {
      this.pending2fa = result.twoFactorToken
      this.setState({ status: 'needs2fa' })
      return this.state
    }
    return await this.completeLogin(result.session)
  }

  async login2fa(code: string): Promise<NexoAccountState> {
    if (!this.pending2fa) throw new Error('no pending two-factor login')
    const session = await this.deps.client.login2fa(this.pending2fa, code.trim())
    this.pending2fa = undefined
    return await this.completeLogin(session)
  }

  cancel2fa(): void {
    this.pending2fa = undefined
    this.setState({ status: 'loggedOut' })
  }

  private async completeLogin(login: LoginSuccess): Promise<NexoAccountState> {
    // 会话令牌 30 天过期且不续期；换成个人 API 令牌（手动吊销前一直有效）实现“保持在线”
    const tokenName = `NEXO ${this.deps.deviceName()}`.slice(0, 64)
    await this.deps.client.revokeApiTokenByName(login.token, tokenName).catch(() => {})
    const apiToken = await this.deps.client.createApiToken(login.token, tokenName)
    const account = { username: login.username, nickname: login.nickname, email: login.email }
    this.session = { username: login.username, apiToken, tokenName, account }
    await this.deps.saveSession(this.session)
    this.setState({ status: 'loggedIn', account, syncing: true })
    await this.sync()
    return this.state
  }

  /** 拉取账户信息与绑定订阅并应用。并发调用合并为一次。 */
  sync(): Promise<void> {
    if (!this.syncPromise) {
      this.syncPromise = this.doSync().finally(() => {
        this.syncPromise = undefined
      })
    }
    return this.syncPromise
  }

  private async doSync(): Promise<void> {
    const session = this.session
    if (!session) throw new Error('not logged in')
    const { client } = this.deps
    this.setState({
      status: 'loggedIn',
      account: session.account ?? { username: session.username },
      syncing: true
    })
    try {
      const [profile, subs, subToken] = await Promise.all([
        client.profile(session.apiToken),
        client.subscriptions(session.apiToken),
        client.subscriptionToken(session.apiToken)
      ])
      const sub = pickSubscription(subs)
      if (!sub) throw new Error('NO_SUBSCRIPTION')
      const downloaded = await client.downloadSubscription(client.subscriptionUrl(sub, subToken))
      await this.deps.applyProfile(downloaded.content)
      const account = buildAccountInfo(profile, sub, subs, downloaded.userInfo, this.now())
      // 会话可能已在同步期间被退出登录
      if (this.session !== session) return
      session.account = account
      await this.deps.saveSession(session)
      this.setState({ status: 'loggedIn', account, syncing: false })
      this.deps.log?.info(`NEXO subscription synced for ${account.username}`)
    } catch (e) {
      if (e instanceof MasterApiError && e.status === 401) {
        this.deps.log?.warn('NEXO session rejected by master, logging out', e)
        await this.logout({ revoke: false, error: 'SESSION_EXPIRED' })
        throw e
      }
      if (this.session === session) {
        this.setState({
          status: 'loggedIn',
          account: session.account ?? { username: session.username },
          syncing: false,
          error: e instanceof Error ? e.message : String(e)
        })
      }
      this.deps.log?.warn('NEXO subscription sync failed', e)
      throw e
    }
  }

  async logout(opts: { revoke?: boolean; error?: string } = {}): Promise<void> {
    const session = this.session
    this.session = undefined
    this.pending2fa = undefined
    if (session && opts.revoke !== false) {
      await this.deps.client
        .revokeApiTokenByName(session.apiToken, session.tokenName)
        .catch((e) => this.deps.log?.warn('Failed to revoke NEXO API token', e))
    }
    await this.deps.clearSession()
    await this.deps.removeProfile()
    this.setState({ status: 'loggedOut', ...(opts.error ? { error: opts.error } : {}) })
  }
}

function toUnix(iso?: string | null): number | undefined {
  if (!iso) return undefined
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

export function buildAccountInfo(
  profile: { username: string; nickname?: string; email?: string },
  sub: MasterSubscription,
  subs: MasterSubscription[],
  userInfo: SubscriptionUserInfo | undefined,
  now: number
): NexoAccountInfo {
  // 用量优先取订阅响应头（与客户端实际可用的额度一致），没有时按套餐汇总
  const packages = subs.filter((s) => s.type === 'package')
  const fallbackUsed =
    sub.type === 'merged'
      ? packages.reduce((n, s) => n + (s.traffic_used ?? 0), 0)
      : (sub.traffic_used ?? 0)
  const fallbackTotal =
    sub.type === 'merged'
      ? packages.reduce((n, s) => n + (s.traffic_total ?? 0), 0)
      : (sub.traffic_total ?? 0)
  return {
    username: profile.username,
    nickname: profile.nickname || undefined,
    email: profile.email || undefined,
    subscriptionName: sub.name,
    trafficUsed: userInfo ? userInfo.upload + userInfo.download : fallbackUsed,
    trafficTotal: userInfo ? userInfo.total : fallbackTotal,
    expire: userInfo?.expire ?? toUnix(sub.expire_at),
    lastSync: now
  }
}
