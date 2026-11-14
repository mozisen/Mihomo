// 妙妙屋X 主控客户端：经加密通道调用 /login、/subscriptions、/user/*，并用明文 HTTPS 下载订阅。
import {
  newRequestNonce,
  openResponse,
  sealRequest,
  SecureChannelError,
  verifyMasterCert,
  type MasterCert
} from './secureChannel'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export class MasterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'MasterApiError'
  }
}

export interface LoginSuccess {
  token: string
  expires_at?: string
  username: string
  email?: string
  nickname?: string
  avatar_url?: string
  role?: string
  is_admin?: boolean
}

export type LoginResult =
  { kind: 'ok'; session: LoginSuccess } | { kind: '2fa'; twoFactorToken: string }

export interface MasterSubscription {
  id: number
  name: string
  filename: string
  type?: string
  file_short_code?: string
  custom_short_code?: string
  expire_at?: string | null
  subscription_path?: string
  traffic_used?: number
  traffic_total?: number
}

export interface MasterProfile {
  username: string
  email?: string
  nickname?: string
  avatar_url?: string
  role?: string
  is_admin?: boolean
}

export interface SubscriptionUserInfo {
  upload: number
  download: number
  total: number
  expire?: number
}

export interface DownloadedSubscription {
  content: string
  userInfo?: SubscriptionUserInfo
}

export interface MasterClientOptions {
  /** 主控地址，如 https://mx.voee.de */
  baseUrl: string
  userAgent: string
  fetch?: FetchLike
  now?: () => number
  timeoutMs?: number
  /** 仅测试用：替换许可证服务验签公钥 */
  issuerPublicKey?: string
}

const CERT_REFRESH_MARGIN_SEC = 24 * 3600

export class MasterClient {
  readonly baseUrl: string
  readonly host: string
  private readonly fetchImpl: FetchLike
  private readonly now: () => number
  private readonly timeoutMs: number
  private readonly userAgent: string
  private readonly issuerPublicKey?: string
  private cert?: { masterPub: Buffer; expireUnix: number }
  /** 服务器时间 − 本机时间（秒）。本机时钟不准时，请求时间戳与证书有效期都按服务器时间计算 */
  private clockSkewSec = 0

  constructor(opts: MasterClientOptions) {
    const url = new URL(opts.baseUrl)
    if (url.protocol !== 'https:') throw new Error('master address must use https')
    this.baseUrl = url.origin
    this.host = url.hostname.toLowerCase()
    this.fetchImpl = opts.fetch ?? ((u, i) => fetch(u, i))
    this.now = opts.now ?? ((): number => Date.now())
    this.timeoutMs = opts.timeoutMs ?? 20_000
    this.userAgent = opts.userAgent
    this.issuerPublicKey = opts.issuerPublicKey
  }

  private nowUnix(): number {
    return Math.floor(this.now() / 1000) + this.clockSkewSec
  }

  /** 主控要求请求时间戳与服务器相差不超过 120 秒；用响应的 Date 头校正本机时钟偏差。 */
  private observeServerDate(header: string | null): void {
    if (!header) return
    const server = Date.parse(header)
    if (Number.isNaN(server)) return
    const skew = Math.round((server - this.now()) / 1000)
    // Date 头只精确到秒，小偏差不必校正
    this.clockSkewSec = Math.abs(skew) > 10 ? skew : 0
  }

  get clockSkewSeconds(): number {
    return this.clockSkewSec
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        ...init,
        headers: { 'User-Agent': this.userAgent, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs)
      })
      this.observeServerDate(res.headers.get('date'))
      return res
    } catch (e) {
      throw new SecureChannelError(
        `cannot reach ${this.host}: ${e instanceof Error ? e.message : String(e)}`,
        'network'
      )
    }
  }

  async masterPublicKey(): Promise<Buffer> {
    if (this.cert && this.nowUnix() < this.cert.expireUnix - CERT_REFRESH_MARGIN_SEC) {
      return this.cert.masterPub
    }
    const res = await this.request('/api/secure/cert')
    const body = (await res.json().catch(() => undefined)) as
      (MasterCert & { error?: string }) | undefined
    if (!res.ok || !body || body.error) {
      throw new SecureChannelError(
        `master certificate unavailable (HTTP ${res.status})${body?.error ? `: ${body.error}` : ''}`,
        'cert_unavailable'
      )
    }
    const masterPub = verifyMasterCert(body, this.host, this.nowUnix(), this.issuerPublicKey)
    this.cert = { masterPub, expireUnix: body.expireUnix }
    return masterPub
  }

  /** 经加密通道调用主控接口。非 2xx 时抛 MasterApiError（401 表示令牌失效）。 */
  async rpc<T>(
    path: string,
    opts: { method?: string; token?: string; body?: Record<string, unknown> } = {}
  ): Promise<T> {
    const skewBefore = this.clockSkewSec
    try {
      return await this.rpcOnce<T>(path, opts)
    } catch (e) {
      // 这次响应才发现本机时钟偏差：时间戳被拒，按校正后的时间重试一次
      const retriable =
        e instanceof MasterApiError && e.status !== 401 && e.status !== 429 && e.status < 500
      if (retriable && this.clockSkewSec !== skewBefore) return await this.rpcOnce<T>(path, opts)
      throw e
    }
  }

  private async rpcOnce<T>(
    path: string,
    opts: { method?: string; token?: string; body?: Record<string, unknown> }
  ): Promise<T> {
    const masterPub = await this.masterPublicKey()
    const payload: Record<string, unknown> = {
      ...(opts.body ?? {}),
      path,
      method: opts.method ?? 'GET',
      ts: this.nowUnix(),
      nonce: newRequestNonce()
    }
    if (opts.token) payload.token = opts.token
    const { body, responseKey } = sealRequest(masterPub, payload)
    const res = await this.request('/api/secure/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(body)
    })
    const raw = Buffer.from(await res.arrayBuffer())
    let data: unknown
    try {
      data = openResponse(responseKey, raw)
    } catch (e) {
      // 信封本身解不开时主控回明文 {"error":"bad envelope"}；证书可能已轮换，丢掉缓存
      this.cert = undefined
      if (!res.ok) throw new MasterApiError(raw.toString('utf8') || 'bad envelope', res.status)
      throw e
    }
    if (!res.ok) {
      const err = data && typeof data === 'object' && 'error' in data ? String(data.error) : ''
      const message = err || `HTTP ${res.status}`
      throw new MasterApiError(message, res.status, data)
    }
    return data as T
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const data = await this.rpc<
      LoginSuccess & { requires_2fa?: boolean; two_factor_token?: string }
    >('/login', { method: 'POST', body: { username, password, remember_me: true } })
    if (data.requires_2fa && data.two_factor_token) {
      return { kind: '2fa', twoFactorToken: data.two_factor_token }
    }
    return { kind: 'ok', session: data }
  }

  async login2fa(twoFactorToken: string, code: string): Promise<LoginSuccess> {
    return await this.rpc<LoginSuccess>('/login/2fa', {
      method: 'POST',
      body: { two_factor_token: twoFactorToken, code }
    })
  }

  async profile(token: string): Promise<MasterProfile> {
    return await this.rpc<MasterProfile>('/user/profile', { token })
  }

  async subscriptions(token: string): Promise<MasterSubscription[]> {
    const data = await this.rpc<{ subscriptions?: MasterSubscription[] }>('/subscriptions', {
      token
    })
    return Array.isArray(data.subscriptions) ? data.subscriptions : []
  }

  async subscriptionToken(token: string): Promise<string> {
    const data = await this.rpc<{ token?: string }>('/user/token', { token })
    if (!data.token) throw new MasterApiError('subscription token missing', 500, data)
    return data.token
  }

  async createApiToken(token: string, name: string): Promise<string> {
    const data = await this.rpc<{ token?: string }>('/user/api-tokens', {
      method: 'POST',
      token,
      body: { name }
    })
    if (!data.token) throw new MasterApiError('api token missing', 500, data)
    return data.token
  }

  async revokeApiTokenByName(token: string, name: string): Promise<void> {
    const data = await this.rpc<{ tokens?: { id: number; name: string }[] }>('/user/api-tokens', {
      token
    })
    for (const t of data.tokens ?? []) {
      if (t.name === name) {
        await this.rpc(`/user/api-tokens/${t.id}`, { method: 'DELETE', token })
      }
    }
  }

  subscriptionUrl(sub: MasterSubscription, subscriptionToken: string): string {
    const path = sub.subscription_path
    if (path?.startsWith('/x/')) return this.baseUrl + path
    const url = path
      ? new URL(path, this.baseUrl)
      : new URL(`/api/clash/subscribe?filename=${encodeURIComponent(sub.filename)}`, this.baseUrl)
    url.searchParams.set('token', subscriptionToken)
    return url.toString()
  }

  async downloadSubscription(url: string): Promise<DownloadedSubscription> {
    const target = new URL(url)
    if (target.origin !== this.baseUrl) throw new Error('subscription URL is not on the master')
    const res = await this.request(target.pathname + target.search)
    if (!res.ok)
      throw new MasterApiError(`subscription download failed (HTTP ${res.status})`, res.status)
    const content = await res.text()
    const header = res.headers.get('subscription-userinfo')
    return { content, userInfo: header ? parseSubscriptionUserInfo(header) : undefined }
  }
}

export function parseSubscriptionUserInfo(header: string): SubscriptionUserInfo {
  const out: Record<string, number> = {}
  for (const part of header.split(';')) {
    const [k, v] = part.split('=').map((s) => s.trim())
    if (k && v && /^\d+$/.test(v)) out[k.toLowerCase()] = Number(v)
  }
  return {
    upload: out.upload ?? 0,
    download: out.download ?? 0,
    total: out.total ?? 0,
    ...(out.expire !== undefined && out.expire < 4102444799 ? { expire: out.expire } : {})
  }
}

/** 选择用户“绑定的配置”：优先合并订阅，其次第一个套餐，最后第一个订阅。 */
export function pickSubscription(subs: MasterSubscription[]): MasterSubscription | undefined {
  return subs.find((s) => s.type === 'merged') ?? subs.find((s) => s.type === 'package') ?? subs[0]
}
