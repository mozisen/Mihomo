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
  const store: { session?: NexoSession; profile?: string } = { session: saved }
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
    applyProfile: async (content) => {
      store.profile = content
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
    await expect(service.login('alice', 'nope')).rejects.toMatchObject({ status: 401 })
    expect(store.session).toBeUndefined()
    expect(service.getState().status).toBe('loggedOut')
  })

  it('removes a leftover profile when started without a session', async () => {
    const { store, service } = setup()
    store.profile = 'stale'
    await service.init()
    expect(store.profile).toBeUndefined()
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
    expect(service.getState()).toMatchObject({ status: 'loggedIn', syncing: true })
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
