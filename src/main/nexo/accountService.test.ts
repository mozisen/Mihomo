import { describe, expect, it, vi } from 'vitest'
import { NexoAccountService, buildAccountInfo, type NexoSession } from './accountService'
import { MasterClient } from './client'
import { createTestMaster } from './testMaster'

function setup(opts: Parameters<typeof createTestMaster>[0] = {}, saved?: NexoSession) {
  const master = createTestMaster(opts)
  const client = new MasterClient({
    baseUrl: 'https://mx.voee.de',
    userAgent: 'mihomo/1.19.34 NEXO/1.0.0',
    fetch: master.fetch,
    issuerPublicKey: master.issuerPublicKey
  })
  const store: { session?: NexoSession; profile?: string; profileName?: string } = {
    session: saved
  }
  const states: string[] = []
  const service = new NexoAccountService({
    client,
    deviceName: () => 'test-pc',
    loadSession: async () => store.session,
    saveSession: async (s) => {
      store.session = JSON.parse(JSON.stringify(s))
    },
    clearSession: async () => {
      store.session = undefined
    },
    applyProfile: async (content, meta) => {
      store.profile = content
      store.profileName = meta.name
    },
    removeProfile: async () => {
      store.profile = undefined
    },
    onChange: (s) => states.push(s.status),
    now: () => 1_700_000_000_000
  })
  return { master, client, store, states, service }
}

describe('NexoAccountService', () => {
  it('logs in, keeps a long-lived API token and applies the bound subscription', async () => {
    const { master, store, service } = setup()
    const state = await service.login(' alice ', 'secret')
    expect(state).toMatchObject({
      status: 'loggedIn',
      syncing: false,
      account: { username: 'alice', trafficUsed: 1024, trafficTotal: 4096, expire: 1798761600 }
    })
    expect(store.session?.apiToken).toMatch(/^mmwx_/)
    expect(store.session?.tokenName).toBe('NEXO test-pc')
    expect(store.profile).toContain('proxies:')
    expect(store.profileName).toBe('月付套餐')
    expect([...master.apiTokens.values()].map((t) => t.name)).toEqual(['NEXO test-pc'])
    // 不能调用会重置所有凭证的 POST /user/token
    expect(master.calls).not.toContain('POST /user/token')
  })

  it('replaces the token from a previous login on the same device', async () => {
    const { master, service } = setup()
    await service.login('alice', 'secret')
    await service.login('alice', 'secret')
    expect(master.apiTokens.size).toBe(1)
  })

  it('falls back to the session token when API tokens are not allowed', async () => {
    const { master, store, service } = setup({ apiTokensDisabled: true })
    const state = await service.login('alice', 'secret')
    expect(state.status).toBe('loggedIn')
    expect(store.session?.apiToken).toMatch(/^sess-/)
    expect(store.session?.tokenName).toBeUndefined()
    expect(store.profile).toContain('proxies:')
    await service.logout()
    expect(master.calls.filter((c) => c.startsWith('DELETE'))).toEqual([])
  })

  it('stays logged in when the first config update fails', async () => {
    const { store, service } = setup()
    // 下载订阅失败：仍算登录成功，错误显示在账户页
    const spy = vi
      .spyOn(MasterClient.prototype, 'downloadSubscription')
      .mockRejectedValueOnce(new Error('subscription download failed (HTTP 502)'))
    const state = await service.login('alice', 'secret')
    spy.mockRestore()
    expect(state).toMatchObject({
      status: 'loggedIn',
      error: 'subscription download failed (HTTP 502)'
    })
    expect(store.session).toBeDefined()
  })

  it('handles two-factor login', async () => {
    const { store, service } = setup({
      users: { bob: { password: 'pw', twoFactorCode: '654321' } }
    })
    expect((await service.login('bob', 'pw')).status).toBe('needs2fa')
    expect(store.session).toBeUndefined()
    expect((await service.login2fa('654321')).status).toBe('loggedIn')
    expect(store.profile).toBeDefined()
  })

  it('rejects wrong credentials without storing anything', async () => {
    const { store, service } = setup()
    await service.init()
    await expect(service.login('alice', 'nope')).rejects.toMatchObject({ status: 401 })
    expect(store.session).toBeUndefined()
    expect(service.getState().status).toBe('loggedOut')
  })

  it('treats an unreadable session file as logged out', async () => {
    const { service, store } = setup()
    store.profile = 'stale'
    const broken = new NexoAccountService({
      ...(service as unknown as { deps: ConstructorParameters<typeof NexoAccountService>[0] }).deps,
      loadSession: async () => {
        throw new Error('decrypt failed')
      }
    })
    await broken.init()
    expect(broken.getState().status).toBe('loggedOut')
    expect(store.profile).toBeUndefined()
  })

  it('removes a leftover profile when started without a session', async () => {
    const { store, service } = setup()
    store.profile = 'stale'
    await service.init()
    expect(store.profile).toBeUndefined()
    expect(service.getState().status).toBe('loggedOut')
  })

  it('starts in a loading state until the saved session is read', async () => {
    const { service } = setup()
    expect(service.getState().status).toBe('loading')
    await service.init()
    expect(service.getState().status).toBe('loggedOut')
  })

  it('stays logged in across restarts and refreshes the config on start', async () => {
    const first = setup()
    await first.service.login('alice', 'secret')
    const saved = first.store.session
    if (!saved) throw new Error('expected session')
    // 模拟重启：同一主控、已保存的会话、空的订阅
    first.store.profile = undefined
    const service = new NexoAccountService({
      client: first.client,
      deviceName: () => 'test-pc',
      loadSession: async () => saved,
      saveSession: async () => {},
      clearSession: async () => {},
      applyProfile: async (c) => {
        first.store.profile = c
      },
      removeProfile: async () => {}
    })
    await service.init()
    expect(service.getState()).toMatchObject({ status: 'loggedIn' })
    expect(first.store.profile).toBeUndefined()
    await service.sync()
    expect(first.store.profile).toContain('proxies:')
    expect(service.getState()).toMatchObject({ status: 'loggedIn', syncing: false })
  })

  it('logs out and drops the profile when the master revokes the token', async () => {
    const { master, store, service } = setup()
    await service.login('alice', 'secret')
    master.revokeAll()
    await expect(service.sync()).rejects.toMatchObject({ status: 401 })
    expect(service.getState()).toEqual({ status: 'loggedOut', error: 'SESSION_EXPIRED' })
    expect(store.session).toBeUndefined()
    expect(store.profile).toBeUndefined()
  })

  it('keeps the session but reports the error when the master is unreachable', async () => {
    const { master, store, service } = setup()
    await service.login('alice', 'secret')
    master.certStatus.unavailable = 'down'
    // 证书已缓存，让下载失败来模拟网络问题
    const sync = vi
      .spyOn(MasterClient.prototype, 'profile')
      .mockRejectedValueOnce(new Error('offline'))
    await expect(service.sync()).rejects.toThrow('offline')
    sync.mockRestore()
    expect(service.getState()).toMatchObject({ status: 'loggedIn', error: 'offline' })
    expect(store.session).toBeDefined()
    expect(store.profile).toBeDefined()
  })

  it('revokes the API token on logout', async () => {
    const { master, store, service } = setup()
    await service.login('alice', 'secret')
    await service.logout()
    expect(master.apiTokens.size).toBe(0)
    expect(store.session).toBeUndefined()
    expect(store.profile).toBeUndefined()
  })

  it('does not write the profile back when logged out during a refresh', async () => {
    const { store, service } = setup()
    await service.login('alice', 'secret')
    const pending = service.sync()
    await service.logout()
    await pending.catch(() => {})
    expect(store.profile).toBeUndefined()
    expect(service.getState().status).toBe('loggedOut')
  })

  it('merges concurrent refreshes into one request', async () => {
    const { master, service } = setup()
    await service.login('alice', 'secret')
    const before = master.calls.filter((c) => c.startsWith('DOWNLOAD')).length
    await Promise.all([service.sync(), service.sync()])
    expect(master.calls.filter((c) => c.startsWith('DOWNLOAD')).length).toBe(before + 1)
  })
})

describe('buildAccountInfo', () => {
  it('sums package usage for a merged subscription when no usage header is sent', () => {
    const info = buildAccountInfo(
      { username: 'u' },
      { id: 0, name: 'all', filename: 'm', type: 'merged' },
      [
        { id: 0, name: 'all', filename: 'm', type: 'merged' },
        { id: -1, name: 'a', filename: 'a', type: 'package', traffic_used: 1, traffic_total: 10 },
        { id: -2, name: 'b', filename: 'b', type: 'package', traffic_used: 2, traffic_total: 20 }
      ],
      undefined,
      5
    )
    expect(info).toMatchObject({ trafficUsed: 3, trafficTotal: 30, lastSync: 5 })
  })
})

describe('optional account details', () => {
  const login = async (opts: Parameters<typeof createTestMaster>[0]) => {
    const ctx = setup(opts)
    await ctx.service.init()
    await ctx.service.login('alice', 'secret')
    const s = ctx.service.getState()
    return { ...ctx, account: s.status === 'loggedIn' ? s.account : undefined }
  }

  it('reads the reset day of the current package and the online IPs', async () => {
    const { account } = await login({
      extraRoutes: {
        '/user/package-assignments': [
          200,
          [
            { id: 3, reset_day: 1, is_reset: true },
            { id: 7, reset_day: 15, is_reset: true }
          ]
        ],
        '/user/traffic/live': [
          200,
          {
            ips: [
              { ip: '1.2.3.4', region: 'TW', conns: 10 },
              { ip: '5.6.7.8', conns: 6 },
              { ip: '9.9.9.9' },
              {}
            ]
          }
        ]
      }
    })
    expect(account?.resetDay).toBe(15)
    expect(account?.online).toEqual({ ips: 3, conns: 16 })
  })

  it('falls back to the second candidate path and the wrapped response shape', async () => {
    const { account, master, service } = await login({
      extraRoutes: {
        '/user/packages': [200, { assignments: [{ id: 7, reset_day: 9, is_reset: true }] }],
        '/user/traffic-live': [200, { ips: [] }]
      }
    })
    expect(account?.resetDay).toBe(9)
    expect(account?.online).toEqual({ ips: 0, conns: 0 })
    master.calls.length = 0
    await service.sync()
    // 已知命中的路径：之后不再试第一个候选
    expect(master.calls).toContain('GET /user/packages')
    expect(master.calls).not.toContain('GET /user/package-assignments')
  })

  it('stops probing once no candidate exists', async () => {
    const { account, master, service } = await login({})
    expect(account?.resetDay).toBeUndefined()
    expect(account?.online).toBeUndefined()
    master.calls.length = 0
    await service.sync()
    expect(
      master.calls.filter(
        (c) => c.startsWith('GET /user/pack') || c.startsWith('GET /user/traffic')
      )
    ).toEqual([])
  })

  it('does not log out when an optional endpoint rejects the token', async () => {
    const { service, store, account } = await login({
      extraRoutes: { '/user/package-assignments': [401, { error: 'unauthorized' }] }
    })
    expect(service.getState().status).toBe('loggedIn')
    expect(store.profile).toBeDefined()
    expect(account?.resetDay).toBeUndefined()
  })

  it('ignores a package that does not reset', async () => {
    const { account } = await login({
      extraRoutes: {
        '/user/package-assignments': [
          200,
          [
            { id: 7, reset_day: 15, is_reset: false },
            { id: 3, reset_day: 1, is_reset: true }
          ]
        ]
      }
    })
    expect(account?.resetDay).toBeUndefined()
  })
})

describe('online refresh', () => {
  it('updates only the online counts without downloading the subscription', async () => {
    const live: [number, unknown] = [200, { ips: [{ ip: '1.1.1.1', conns: 2 }] }]
    const ctx = setup({ extraRoutes: { '/user/traffic/live': live } })
    await ctx.service.init()
    await ctx.service.login('alice', 'secret')
    live[1] = {
      ips: [
        { ip: '1.1.1.1', conns: 10 },
        { ip: '2.2.2.2', conns: 6 }
      ]
    }
    ctx.master.calls.length = 0
    await ctx.service.refreshOnline()
    expect(ctx.master.calls).toEqual(['GET /user/traffic/live'])
    const s = ctx.service.getState()
    expect(s.status === 'loggedIn' && s.account.online).toEqual({ ips: 2, conns: 16 })
  })

  it('sends nothing when the master has no live endpoint or nobody is logged in', async () => {
    const ctx = setup({})
    await ctx.service.init()
    await ctx.service.refreshOnline()
    await ctx.service.login('alice', 'secret')
    ctx.master.calls.length = 0
    await ctx.service.refreshOnline()
    expect(ctx.master.calls).toEqual([])
  })

  it('keeps the last counts when a refresh fails', async () => {
    const live: [number, unknown] = [200, { ips: [{ ip: '1.1.1.1', conns: 3 }] }]
    const ctx = setup({ extraRoutes: { '/user/traffic/live': live } })
    await ctx.service.init()
    await ctx.service.login('alice', 'secret')
    live[0] = 500
    await ctx.service.refreshOnline()
    const s = ctx.service.getState()
    expect(s.status).toBe('loggedIn')
    expect(s.status === 'loggedIn' && s.account.online).toEqual({ ips: 1, conns: 3 })
  })
})
