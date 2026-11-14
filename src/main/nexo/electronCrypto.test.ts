import { describe, expect, it, vi } from 'vitest'

// Electron 的 crypto 基于 BoringSSL：createCipheriv/createDecipheriv 不认识 chacha20-poly1305。
// 在这里模拟这一点，确保加密通道不依赖 Node 内置的 ChaCha20-Poly1305。
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  const unknownCipher = (algorithm: string): never => {
    const err = new Error(`Unknown cipher ${algorithm}`) as Error & { code: string }
    err.code = 'ERR_CRYPTO_UNKNOWN_CIPHER'
    throw err
  }
  const guard =
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (algorithm: string, ...rest: unknown[]): unknown =>
      /chacha20/i.test(algorithm)
        ? unknownCipher(algorithm)
        : (fn as unknown as (...a: unknown[]) => unknown)(algorithm, ...rest)
  const createCipheriv = guard(actual.createCipheriv)
  const createDecipheriv = guard(actual.createDecipheriv)
  return {
    ...actual,
    default: { ...actual, createCipheriv, createDecipheriv },
    createCipheriv,
    createDecipheriv
  }
})

describe('secure channel under Electron (BoringSSL)', () => {
  it('cannot use the native chacha20-poly1305 cipher', async () => {
    const { createCipheriv } = await import('crypto')
    expect(() =>
      createCipheriv('chacha20-poly1305', Buffer.alloc(32), Buffer.alloc(12), {
        authTagLength: 16
      } as never)
    ).toThrow(/Unknown cipher/)
  })

  it('still completes an encrypted login', async () => {
    const { MasterClient } = await import('./client')
    const { createTestMaster } = await import('./testMaster')
    const master = createTestMaster()
    const client = new MasterClient({
      baseUrl: 'https://mx.voee.de',
      userAgent: 'mihomo/1.19 NEXO/1.0.0',
      fetch: master.fetch,
      issuerPublicKey: master.issuerPublicKey
    })
    const result = await client.login('alice', 'secret')
    expect(result.kind).toBe('ok')
  })
})
