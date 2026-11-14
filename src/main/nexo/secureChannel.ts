// 妙妙屋X 主控加密通道（/api/secure/*）的纯 Node 实现，协议见
// https://miaomiaowux.com/docs/client-api/ 。不依赖 Electron，便于单元测试。
import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomUUID,
  verify,
  type KeyObject
} from 'crypto'

/** 许可证服务验签公钥（Ed25519，原始 32 字节的 base64）。 */
export const LICENSE_ISSUER_PUBLIC_KEY = '/cKXW8AIOPE6ChoZtXjP8N+KkIYvKLvnpLyaLPrpTQM='

const RPC_INFO_C2S = 'mmx-secure-rpc-c2s-v1'
const RPC_INFO_S2C = 'mmx-secure-rpc-s2c-v1'
const NONCE_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

export interface MasterCert {
  masterPub: string
  domain: string
  expireUnix: number
  sig: string
}

export class SecureChannelError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'cert_unavailable'
      | 'cert_invalid'
      | 'cert_domain_mismatch'
      | 'cert_expired'
      | 'bad_envelope'
      | 'network'
  ) {
    super(message)
    this.name = 'SecureChannelError'
  }
}

function rawKey(b64: string, label: string): Buffer {
  const raw = Buffer.from(b64, 'base64')
  if (raw.length !== 32) throw new SecureChannelError(`${label} must be 32 bytes`, 'cert_invalid')
  return raw
}

function ed25519PublicKey(raw: Buffer): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk'
  })
}

function x25519PublicKey(raw: Buffer): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: raw.toString('base64url') },
    format: 'jwk'
  })
}

export function certSignedMessage(
  cert: Pick<MasterCert, 'masterPub' | 'domain' | 'expireUnix'>
): Buffer {
  return Buffer.from(
    ['mmx-cert-v1', cert.masterPub, cert.domain, String(cert.expireUnix)].join('\n'),
    'utf8'
  )
}

/**
 * 校验主控证书：签名、域名、有效期三项都必须通过。返回主控 X25519 公钥原始字节。
 */
export function verifyMasterCert(
  cert: MasterCert,
  expectedHost: string,
  nowUnix = Math.floor(Date.now() / 1000),
  issuerPublicKey: string = LICENSE_ISSUER_PUBLIC_KEY
): Buffer {
  if (
    !cert ||
    typeof cert.masterPub !== 'string' ||
    typeof cert.domain !== 'string' ||
    typeof cert.expireUnix !== 'number' ||
    typeof cert.sig !== 'string'
  ) {
    throw new SecureChannelError('malformed master certificate', 'cert_invalid')
  }
  const sig = Buffer.from(cert.sig, 'base64')
  const ok =
    sig.length === 64 &&
    verify(
      null,
      certSignedMessage(cert),
      ed25519PublicKey(rawKey(issuerPublicKey, 'issuer key')),
      sig
    )
  if (!ok) throw new SecureChannelError('master certificate signature invalid', 'cert_invalid')
  if (cert.domain.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new SecureChannelError(
      `master certificate domain ${cert.domain} does not match ${expectedHost}`,
      'cert_domain_mismatch'
    )
  }
  if (nowUnix >= cert.expireUnix) {
    throw new SecureChannelError('master certificate expired', 'cert_expired')
  }
  return rawKey(cert.masterPub, 'masterPub')
}

function deriveKey(shared: Buffer, salt: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, salt, Buffer.from(info, 'utf8'), KEY_LEN))
}

function seal(key: Buffer, plaintext: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LEN)
  const cipher = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG_LEN })
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([nonce, ct, cipher.getAuthTag()])
}

function open(key: Buffer, sealed: Buffer): Buffer {
  if (sealed.length < NONCE_LEN + TAG_LEN) {
    throw new SecureChannelError('sealed payload too short', 'bad_envelope')
  }
  const nonce = sealed.subarray(0, NONCE_LEN)
  const tag = sealed.subarray(sealed.length - TAG_LEN)
  const ct = sealed.subarray(NONCE_LEN, sealed.length - TAG_LEN)
  const decipher = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: TAG_LEN })
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()])
  } catch {
    throw new SecureChannelError('failed to decrypt payload', 'bad_envelope')
  }
}

export interface SealedRequest {
  body: Buffer
  /** 解密本次请求响应用的密钥（响应方向）。 */
  responseKey: Buffer
}

/** 用临时 X25519 密钥对把 JSON 请求加密成信封：临时公钥(32) ‖ nonce(12) ‖ 密文 ‖ tag(16)。 */
export function sealRequest(masterPub: Buffer, payload: Record<string, unknown>): SealedRequest {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  const ephPub = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')
  const shared = diffieHellman({ privateKey, publicKey: x25519PublicKey(masterPub) })
  const salt = Buffer.concat([ephPub, masterPub])
  const requestKey = deriveKey(shared, salt, RPC_INFO_C2S)
  const responseKey = deriveKey(shared, salt, RPC_INFO_S2C)
  const body = Buffer.concat([
    ephPub,
    seal(requestKey, Buffer.from(JSON.stringify(payload), 'utf8'))
  ])
  return { body, responseKey }
}

export function openResponse(responseKey: Buffer, body: Buffer): unknown {
  const text = open(responseKey, body).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new SecureChannelError('decrypted response is not JSON', 'bad_envelope')
  }
}

/** 主控侧解封（仅测试用的参考实现，验证双向参数一致）。 */
export function openRequestAsMaster(
  masterPrivate: KeyObject,
  masterPub: Buffer,
  body: Buffer
): { payload: Record<string, unknown>; responseKey: Buffer } {
  const ephPub = body.subarray(0, 32)
  const shared = diffieHellman({ privateKey: masterPrivate, publicKey: x25519PublicKey(ephPub) })
  const salt = Buffer.concat([ephPub, masterPub])
  const requestKey = deriveKey(shared, salt, RPC_INFO_C2S)
  const responseKey = deriveKey(shared, salt, RPC_INFO_S2C)
  const payload = JSON.parse(open(requestKey, body.subarray(32)).toString('utf8'))
  return { payload, responseKey }
}

export function sealResponseAsMaster(responseKey: Buffer, value: unknown): Buffer {
  return seal(responseKey, Buffer.from(JSON.stringify(value), 'utf8'))
}

export function newRequestNonce(): string {
  return randomUUID()
}
