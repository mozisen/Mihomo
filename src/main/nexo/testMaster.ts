// 测试用的内存版妙妙屋X 主控：实现 /api/secure/cert、/api/secure/rpc 与订阅下载。
import { generateKeyPairSync, sign, type KeyObject } from 'crypto'
import {
  certSignedMessage,
  openRequestAsMaster,
  sealResponseAsMaster,
  type MasterCert
} from './secureChannel'

function rawPublic(key: KeyObject): Buffer {
  return Buffer.from(key.export({ format: 'jwk' }).x as string, 'base64url')
}

export interface TestMasterOptions {
  domain?: string
  expireUnix?: number
  users?: Record<string, { password: string; twoFactorCode?: string }>
  subscriptionYaml?: string
  userInfoHeader?: string
  /** 模拟主控不允许普通用户创建个人 API 令牌 */
  apiTokensDisabled?: boolean
}

export interface TestMaster {
  issuerPublicKey: string
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  calls: string[]
  apiTokens: Map<string, { id: number; name: string; username: string }>
  sessions: Map<string, string>
  revokeAll: () => void
  certStatus: { unavailable?: string }
}

export function createTestMaster(opts: TestMasterOptions = {}): TestMaster {
  const domain = opts.domain ?? 'mx.voee.de'
  const issuer = generateKeyPairSync('ed25519')
  const master = generateKeyPairSync('x25519')
  const masterPub = rawPublic(master.publicKey)
  const certBody = {
    masterPub: masterPub.toString('base64'),
    domain,
    expireUnix: opts.expireUnix ?? Math.floor(Date.now() / 1000) + 30 * 86400
  }
  const cert: MasterCert = {
    ...certBody,
    sig: sign(null, certSignedMessage(certBody), issuer.privateKey).toString('base64')
  }
  const users = opts.users ?? { alice: { password: 'secret' } }
  const sessions = new Map<string, string>()
  const apiTokens = new Map<string, { id: number; name: string; username: string }>()
  const pending2fa = new Map<string, string>()
  const seenNonces = new Set<string>()
  const calls: string[] = []
  const certStatus: { unavailable?: string } = {}
  let nextId = 1
  const subToken = 'sub-token-uuid'

  const whoami = (token: unknown): string | undefined => {
    if (typeof token !== 'string') return undefined
    return sessions.get(token) ?? apiTokens.get(token)?.username
  }

  const handle = (p: Record<string, unknown>): [number, unknown] => {
    const path = String(p.path)
    const method = String(p.method ?? 'GET')
    calls.push(`${method} ${path}`)
    if (typeof p.nonce !== 'string' || seenNonces.has(p.nonce))
      return [403, { error: 'replayed request' }]
    seenNonces.add(p.nonce)
    if (Math.abs(Number(p.ts) - Date.now() / 1000) > 120) return [403, { error: 'stale request' }]
    const issue = (username: string): unknown => {
      const token = `sess-${nextId++}`
      sessions.set(token, username)
      return { token, username, nickname: username.toUpperCase(), role: 'user', is_admin: false }
    }
    if (path === '/login' && method === 'POST') {
      const u = users[String(p.username)]
      if (!u || u.password !== p.password) return [401, { error: 'invalid credentials' }]
      if (u.twoFactorCode) {
        const t = `2fa-${nextId++}`
        pending2fa.set(t, String(p.username))
        return [200, { requires_2fa: true, two_factor_token: t }]
      }
      return [200, issue(String(p.username))]
    }
    if (path === '/login/2fa' && method === 'POST') {
      const username = pending2fa.get(String(p.two_factor_token))
      if (!username) return [401, { error: 'invalid or expired 2FA token' }]
      if (users[username].twoFactorCode !== p.code) return [401, { error: 'invalid 2FA code' }]
      return [200, issue(username)]
    }
    const user = whoami(p.token)
    if (!user) return [401, { error: 'unauthorized' }]
    if (path === '/user/profile') return [200, { username: user, nickname: user.toUpperCase() }]
    if (path === '/subscriptions') {
      return [
        200,
        {
          subscriptions: [
            {
              id: -7,
              name: '月付套餐',
              filename: '__package__:7',
              type: 'package',
              subscription_path: '/api/user/package-subscribe?assignment_id=7',
              traffic_used: 1024,
              traffic_total: 4096,
              expire_at: '2027-01-01T00:00:00Z'
            }
          ],
          user_short_code: 'U5r'
        }
      ]
    }
    if (path === '/user/token') return [200, { token: subToken, user_short_code: 'U5r' }]
    if (path === '/user/api-tokens' && method === 'POST') {
      if (opts.apiTokensDisabled) return [403, { error: 'api tokens disabled' }]
      const token = `mmwx_${nextId}`
      apiTokens.set(token, { id: nextId++, name: String(p.name), username: user })
      return [201, { success: true, token, name: p.name }]
    }
    if (path === '/user/api-tokens' && method === 'GET') {
      return [
        200,
        {
          success: true,
          tokens: [...apiTokens.values()].filter((t) => t.username === user)
        }
      ]
    }
    const del = /^\/user\/api-tokens\/(\d+)$/.exec(path)
    if (del && method === 'DELETE') {
      for (const [k, v] of apiTokens) if (v.id === Number(del[1])) apiTokens.delete(k)
      return [200, { success: true }]
    }
    return [404, { error: 'not found' }]
  }

  // 真实主控（经 ECHO 反代）每个响应都带 Date 头
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const res = await route(url, init)
    res.headers.set('date', new Date().toUTCString())
    return res
  }

  const route = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url)
    if (u.hostname !== domain) throw new Error(`unexpected host ${u.hostname}`)
    if (u.pathname === '/api/secure/cert') {
      if (certStatus.unavailable) {
        return Response.json(
          { error: certStatus.unavailable, code: 'issuer_error' },
          { status: 503 }
        )
      }
      return Response.json(cert)
    }
    if (u.pathname === '/api/secure/rpc') {
      const body = Buffer.from(init?.body as Uint8Array)
      let opened
      try {
        opened = openRequestAsMaster(master.privateKey, masterPub, body)
      } catch {
        return Response.json({ error: 'bad envelope' }, { status: 400 })
      }
      const [status, value] = handle(opened.payload)
      return new Response(new Uint8Array(sealResponseAsMaster(opened.responseKey, value)), {
        status
      })
    }
    if (u.pathname === '/api/user/package-subscribe') {
      calls.push(`DOWNLOAD ${u.pathname}`)
      const ua = new Headers(init?.headers).get('User-Agent') ?? ''
      if (u.searchParams.get('token') !== subToken || !ua.startsWith('mihomo/')) {
        return new Response('proxies: []\n# token invalid\n')
      }
      return new Response(opts.subscriptionYaml ?? 'proxies:\n  - {name: a, type: ss}\n', {
        headers: {
          'subscription-userinfo':
            opts.userInfoHeader ?? 'upload=0; download=1024; total=4096; expire=1798761600'
        }
      })
    }
    return new Response('not found', { status: 404 })
  }

  return {
    issuerPublicKey: rawPublic(issuer.publicKey).toString('base64'),
    fetch: fetchImpl,
    calls,
    apiTokens,
    sessions,
    certStatus,
    revokeAll: () => {
      sessions.clear()
      apiTokens.clear()
    }
  }
}
