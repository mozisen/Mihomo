import { generateKeyPairSync, sign } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  MasterApiError,
  MasterClient,
  parseSubscriptionUserInfo,
  pickSubscription,
  type MasterSubscription
} from './client'
import { certSignedMessage, SecureChannelError, verifyMasterCert } from './secureChannel'
import { createTestMaster } from './testMaster'

const UA = 'mihomo/1.19.34 NEXO/1.0.0'

function clientFor(master: ReturnType<typeof createTestMaster>, baseUrl = 'https://mx.voee.de') {
  return new MasterClient({
    baseUrl,
    userAgent: UA,
    fetch: master.fetch,
    issuerPublicKey: master.issuerPublicKey
  })
}

describe('verifyMasterCert', () => {
  const issuer = generateKeyPairSync('ed25519')
  const issuerPub = Buffer.from(
    issuer.publicKey.export({ format: 'jwk' }).x as string,
    'base64url'
  ).toString('base64')
  const body = {
    masterPub: Buffer.alloc(32, 7).toString('base64'),
    domain: 'mx.voee.de',
    expireUnix: 2000
  }
  const cert = {
    ...body,
    sig: sign(null, certSignedMessage(body), issuer.privateKey).toString('base64')
  }

  it('accepts a valid certificate for the expected host', () => {
    expect(verifyMasterCert(cert, 'MX.voee.de', 1000, issuerPub)).toEqual(Buffer.alloc(32, 7))
  })

  it('rejects a tampered certificate', () => {
    expect(() =>
      verifyMasterCert({ ...cert, expireUnix: 3000 }, 'mx.voee.de', 1000, issuerPub)
    ).toThrow(/signature invalid/)
  })

  it('rejects a certificate for another domain', () => {
    expect(() => verifyMasterCert(cert, 'evil.example.com', 1000, issuerPub)).toThrow(
      SecureChannelError
    )
  })

  it('rejects an expired certificate', () => {
    expect(() => verifyMasterCert(cert, 'mx.voee.de', 2000, issuerPub)).toThrow(/expired/)
  })

  it('uses the official license issuer key by default', () => {
    expect(() => verifyMasterCert(cert, 'mx.voee.de', 1000)).toThrow(/signature invalid/)
  })
})

describe('MasterClient', () => {
  it('logs in through the encrypted channel', async () => {
    const master = createTestMaster()
    const result = await clientFor(master).login('alice', 'secret')
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.session.username).toBe('alice')
      expect(master.sessions.has(result.session.token)).toBe(true)
    }
  })

  it('reports invalid credentials as a 401 MasterApiError', async () => {
    const master = createTestMaster()
    await expect(clientFor(master).login('alice', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'invalid credentials'
    })
  })

  it('supports the two-factor flow', async () => {
    const master = createTestMaster({ users: { bob: { password: 'pw', twoFactorCode: '123456' } } })
    const client = clientFor(master)
    const first = await client.login('bob', 'pw')
    expect(first.kind).toBe('2fa')
    if (first.kind !== '2fa') return
    await expect(client.login2fa(first.twoFactorToken, '000000')).rejects.toBeInstanceOf(
      MasterApiError
    )
    const ok = await client.login2fa(first.twoFactorToken, '123456')
    expect(ok.username).toBe('bob')
  })

  it('refuses a certificate not signed by the license issuer', async () => {
    const master = createTestMaster({ domain: 'mx.voee.de' })
    const client = new MasterClient({
      baseUrl: 'https://mx.voee.de',
      userAgent: UA,
      fetch: (url, init) => master.fetch(url, init),
      issuerPublicKey: generateKeyPairSync('ed25519')
        .publicKey.export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('base64')
    })
    await expect(client.login('alice', 'secret')).rejects.toMatchObject({ code: 'cert_invalid' })
  })

  it('surfaces an unavailable master certificate', async () => {
    const master = createTestMaster()
    master.certStatus.unavailable = 'certificate request rejected (403): machine mismatch'
    await expect(clientFor(master).login('alice', 'secret')).rejects.toMatchObject({
      code: 'cert_unavailable',
      message: expect.stringContaining('machine mismatch')
    })
  })

  it('creates and revokes a personal API token', async () => {
    const master = createTestMaster()
    const client = clientFor(master)
    const login = await client.login('alice', 'secret')
    if (login.kind !== 'ok') throw new Error('expected login')
    const apiToken = await client.createApiToken(login.session.token, 'NEXO test')
    expect(apiToken).toMatch(/^mmwx_/)
    expect((await client.profile(apiToken)).username).toBe('alice')
    await client.revokeApiTokenByName(apiToken, 'NEXO test')
    expect(master.apiTokens.size).toBe(0)
  })

  it('downloads the bound subscription with a mihomo user agent and usage header', async () => {
    const master = createTestMaster()
    const client = clientFor(master)
    const login = await client.login('alice', 'secret')
    if (login.kind !== 'ok') throw new Error('expected login')
    const subs = await client.subscriptions(login.session.token)
    const sub = pickSubscription(subs)
    if (!sub) throw new Error('expected subscription')
    const url = client.subscriptionUrl(sub, await client.subscriptionToken(login.session.token))
    expect(url).toBe(
      'https://mx.voee.de/api/user/package-subscribe?assignment_id=7&token=sub-token-uuid'
    )
    const downloaded = await client.downloadSubscription(url)
    expect(downloaded.content).toContain('proxies:')
    expect(downloaded.userInfo).toEqual({
      upload: 0,
      download: 1024,
      total: 4096,
      expire: 1798761600
    })
  })

  it('treats a revoked token as unauthorized', async () => {
    const master = createTestMaster()
    const client = clientFor(master)
    const login = await client.login('alice', 'secret')
    if (login.kind !== 'ok') throw new Error('expected login')
    master.revokeAll()
    await expect(client.profile(login.session.token)).rejects.toMatchObject({ status: 401 })
  })

  it('corrects for a wrong local clock using the server Date header', async () => {
    const master = createTestMaster()
    // 本机时钟慢了 10 分钟：请求时间戳会被主控以 stale request 拒绝，除非按服务器时间校正
    const client = new MasterClient({
      baseUrl: 'https://mx.voee.de',
      userAgent: UA,
      fetch: master.fetch,
      issuerPublicKey: master.issuerPublicKey,
      now: () => Date.now() - 600_000
    })
    const result = await client.login('alice', 'secret')
    expect(result.kind).toBe('ok')
    expect(Math.abs(client.clockSkewSeconds - 600)).toBeLessThanOrEqual(2)
  })

  it('retries once when the clock skew is only discovered on the rejected request', async () => {
    const master = createTestMaster()
    let offset = 0
    const client = new MasterClient({
      baseUrl: 'https://mx.voee.de',
      userAgent: UA,
      fetch: master.fetch,
      issuerPublicKey: master.issuerPublicKey,
      now: () => Date.now() - offset
    })
    await client.masterPublicKey()
    offset = 600_000 // 证书缓存后本机时间被改
    const result = await client.login('alice', 'secret')
    expect(result.kind).toBe('ok')
  })

  it('only accepts https master addresses', () => {
    expect(() => new MasterClient({ baseUrl: 'http://mx.voee.de', userAgent: UA })).toThrow(/https/)
  })
})

describe('subscription helpers', () => {
  const sub = (s: Partial<MasterSubscription>): MasterSubscription => ({
    id: 1,
    name: 'x',
    filename: 'x.yaml',
    ...s
  })

  it('prefers the merged subscription, then a package', () => {
    expect(pickSubscription([sub({ id: 3 }), sub({ id: -7, type: 'package' })])?.id).toBe(-7)
    expect(
      pickSubscription([sub({ id: -7, type: 'package' }), sub({ id: 0, type: 'merged' })])?.id
    ).toBe(0)
    expect(pickSubscription([])).toBeUndefined()
  })

  it('builds short-link and filename subscription URLs', () => {
    const client = new MasterClient({ baseUrl: 'https://mx.voee.de', userAgent: UA })
    expect(client.subscriptionUrl(sub({ subscription_path: '/x/AbC123' }), 't')).toBe(
      'https://mx.voee.de/x/AbC123'
    )
    expect(client.subscriptionUrl(sub({ filename: 'my file.yaml' }), 't')).toBe(
      'https://mx.voee.de/api/clash/subscribe?filename=my+file.yaml&token=t'
    )
  })

  it('parses subscription-userinfo and ignores the no-expiry sentinel', () => {
    expect(parseSubscriptionUserInfo('upload=1; download=2; total=3; expire=4102444799')).toEqual({
      upload: 1,
      download: 2,
      total: 3
    })
  })
})
