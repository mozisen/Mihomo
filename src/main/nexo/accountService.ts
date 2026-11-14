// NEXO 账户：登录妙妙屋X、保持在线、自动更新绑定的订阅。依赖全部注入，便于单元测试。
import type { NexoAccountInfo, NexoAccountState } from '../../shared/nexo'
import {
  MasterApiError,
  pickResetDay,
  pickSubscription,
  type LoginSuccess,
  type MasterClient,
  type MasterOnlineIp,
  type MasterSubscription,
  type SubscriptionUserInfo
} from './client'

export type { NexoAccountInfo, NexoAccountState }

/** 加密保存在本机的会话（长期有效的个人 API 令牌，退出登录时吊销）。 */
export interface NexoSession {
  username: string
  apiToken: string
  /** 个人 API 令牌的名称；为空表示主控不允许创建 API 令牌，退回使用 30 天的会话令牌 */
  tokenName?: string
  account?: NexoAccountInfo
}

export interface NexoAccountDeps {
  client: MasterClient
  deviceName: () => string
  loadSession: () => Promise<NexoSession | undefined>
  saveSession: (session: NexoSession) => Promise<void>
  clearSession: () => Promise<void>
  /** 校验并以加密形式写入订阅，然后让内核使用它 */
  applyProfile: (
    content: string,
    meta: { name: string; userInfo?: SubscriptionUserInfo }
  ) => Promise<void>
  /** 删除 NEXO 订阅（退出登录 / 会话失效） */
  removeProfile: () => Promise<void>
  /** 启动时内核尚未运行：只清掉 NEXO 订阅记录与文件，不重启内核。缺省时用 removeProfile */
  purgeProfileOffline?: () => Promise<void>
  onChange?: (state: NexoAccountState) => void
  now?: () => number
  log?: { info: (msg: string) => void; warn: (msg: string, e?: unknown) => void }
}

export class NexoAccountService {
  private session?: NexoSession
  private pending2fa?: string
  private state: NexoAccountState = { status: 'loading' }
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

  /**
   * 应用启动（内核启动前）：有会话就保持登录，随后由调用方 sync() 更新配置；
   * 没有会话就清掉残留的 NEXO 订阅，保证未登录时无法使用配置。
   */
  async init(): Promise<void> {
    try {
      this.session = await this.deps.loadSession()
    } catch (e) {
      this.deps.log?.warn('Failed to load NEXO session', e)
      this.session = undefined
    }
    if (!this.session) {
      await (this.deps.purgeProfileOffline ?? this.deps.removeProfile)()
      this.setState({ status: 'loggedOut' })
      return
    }
    this.setState({
      status: 'loggedIn',
      account: this.session.account ?? { username: this.session.username },
      syncing: false
    })
  }

  isLoggedIn(): boolean {
    return !!this.session
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
    let tokenName: string | undefined = `NEXO ${this.deps.deviceName()}`.slice(0, 64)
    let apiToken = login.token
    try {
      await this.deps.client.revokeApiTokenByName(login.token, tokenName).catch(() => {})
      apiToken = await this.deps.client.createApiToken(login.token, tokenName)
    } catch (e) {
      if (e instanceof MasterApiError && e.status === 401) throw e
      // 主控未开放个人 API 令牌：仍可用会话令牌登录（30 天有效，失效后需要重新登录）
      this.deps.log?.warn('Cannot create NEXO API token, falling back to the session token', e)
      tokenName = undefined
      apiToken = login.token
    }
    const account = { username: login.username, nickname: login.nickname, email: login.email }
    this.session = { username: login.username, apiToken, tokenName, account }
    await this.deps.saveSession(this.session)
    this.setState({ status: 'loggedIn', account, syncing: true })
    // 已经登录成功：更新配置失败只在账户页提示，不算登录失败
    await this.sync().catch(() => {})
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
      // 会话可能已在下载期间被退出登录：不能再把订阅写回去
      if (this.session !== session) return
      await this.deps.applyProfile(downloaded.content, {
        name: sub.name || 'nexo',
        userInfo: downloaded.userInfo
      })
      const extras = await this.fetchExtras(session.apiToken, sub)
      const account = {
        ...buildAccountInfo(profile, sub, subs, downloaded.userInfo, this.now()),
        ...extras
      }
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

  /**
   * 只刷新在线 IP 数与连接数（账户页每 10 秒调用一次）。不下载订阅、不写会话文件；
   * 主控没有这个接口时不发请求，出错时保持原值。
   */
  async refreshOnline(): Promise<void> {
    const session = this.session
    if (!session || this.syncPromise) return
    let ips
    try {
      ips = await this.deps.client.onlineIps(session.apiToken)
    } catch (e) {
      this.deps.log?.warn('NEXO online refresh failed', e)
      return
    }
    if (!ips || this.session !== session || this.state.status !== 'loggedIn') return
    const account = { ...this.state.account, online: summarizeOnline(ips) }
    session.account = account
    this.setState({ ...this.state, account })
  }

  /** 重置日与在线 IP 走猜测路径的可选接口：拿不到就留空，绝不影响登录与订阅。 */
  private async fetchExtras(
    token: string,
    sub: MasterSubscription
  ): Promise<Pick<NexoAccountInfo, 'resetDay' | 'online'>> {
    const { client, log } = this.deps
    const [assignments, ips] = await Promise.allSettled([
      client.packageAssignments(token),
      client.onlineIps(token)
    ])
    const out: Pick<NexoAccountInfo, 'resetDay' | 'online'> = {}
    if (assignments.status === 'fulfilled' && assignments.value) {
      const day = pickResetDay(assignments.value, sub)
      if (day) out.resetDay = day
    }
    if (ips.status === 'fulfilled' && ips.value) {
      out.online = summarizeOnline(ips.value)
    }
    for (const [name, r] of [
      ['packageAssignments', assignments],
      ['trafficLive', ips]
    ] as const) {
      if (r.status === 'rejected') log?.warn(`NEXO optional endpoint ${name} failed`, r.reason)
      else
        log?.info(`NEXO optional endpoint ${name}: ${client.optionalPath(name) ?? 'unavailable'}`)
    }
    return out
  }

  async logout(opts: { revoke?: boolean; error?: string } = {}): Promise<void> {
    const session = this.session
    this.session = undefined
    this.pending2fa = undefined
    if (session?.tokenName && opts.revoke !== false) {
      await this.deps.client
        .revokeApiTokenByName(session.apiToken, session.tokenName)
        .catch((e) => this.deps.log?.warn('Failed to revoke NEXO API token', e))
    }
    await this.deps.clearSession()
    await this.deps.removeProfile()
    this.setState({ status: 'loggedOut', ...(opts.error ? { error: opts.error } : {}) })
  }
}

export function summarizeOnline(ips: MasterOnlineIp[]): { ips: number; conns: number } {
  const conns = ips.reduce(
    (n, x) => n + (Number.isFinite(x.conns) ? Math.max(0, Number(x.conns)) : 0),
    0
  )
  return { ips: new Set(ips.map((x) => x.ip)).size, conns }
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
