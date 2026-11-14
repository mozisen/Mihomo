import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync
} from 'crypto'
import { describe, expect, it } from 'vitest'
import { openResponse, sealRequest } from './secureChannel'

// 按文档逐项手工推导，独立于 secureChannel 内部实现，防止两端用同一份错误参数“自洽”。
describe('secure RPC envelope layout', () => {
  it('matches the documented X25519 + HKDF-SHA256 + ChaCha20-Poly1305 parameters', () => {
    const master = generateKeyPairSync('x25519')
    const masterPub = Buffer.from(
      master.publicKey.export({ format: 'jwk' }).x as string,
      'base64url'
    )
    const payload = { path: '/user/features', method: 'GET', ts: 1, nonce: 'n' }
    const { body, responseKey } = sealRequest(masterPub, payload)

    // 请求体：临时公钥(32) ‖ nonce(12) ‖ 密文 ‖ tag(16)
    const ephPub = body.subarray(0, 32)
    const nonce = body.subarray(32, 44)
    const tag = body.subarray(body.length - 16)
    const ct = body.subarray(44, body.length - 16)

    const ephKey = createPublicKey({
      key: { kty: 'OKP', crv: 'X25519', x: ephPub.toString('base64url') },
      format: 'jwk'
    })
    const shared = diffieHellman({ privateKey: master.privateKey, publicKey: ephKey })
    const salt = Buffer.concat([ephPub, masterPub]) // 顺序：临时公钥在前
    const c2s = Buffer.from(
      hkdfSync('sha256', shared, salt, Buffer.from('mmx-secure-rpc-c2s-v1'), 32)
    )
    const s2c = Buffer.from(
      hkdfSync('sha256', shared, salt, Buffer.from('mmx-secure-rpc-s2c-v1'), 32)
    )

    const decipher = createDecipheriv('chacha20-poly1305', c2s, nonce, { authTagLength: 16 })
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    expect(JSON.parse(plain)).toEqual(payload)
    expect(responseKey).toEqual(s2c)
  })

  it('rejects a response that was tampered with', () => {
    const master = generateKeyPairSync('x25519')
    const masterPub = Buffer.from(
      master.publicKey.export({ format: 'jwk' }).x as string,
      'base64url'
    )
    const { responseKey } = sealRequest(masterPub, { path: '/x' })
    expect(() => openResponse(responseKey, Buffer.alloc(40, 1))).toThrow(/decrypt/)
  })
})
