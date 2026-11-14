// 本机加密存储：用 Electron safeStorage（Windows DPAPI / macOS 钥匙串 / Linux libsecret）加密。
// 密文只能在本机、本用户下解开；拷走文件也读不出订阅内容和登录令牌。
import { safeStorage } from 'electron'

const MAGIC = Buffer.from('NEXOENC1', 'ascii')

export class SecretStoreUnavailableError extends Error {
  constructor() {
    super('System encryption is not available, NEXO cannot store account data securely')
    this.name = 'SecretStoreUnavailableError'
  }
}

export function isEncryptedBlob(data: Buffer): boolean {
  return data.length > MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC)
}

export function encryptText(text: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) throw new SecretStoreUnavailableError()
  return Buffer.concat([MAGIC, safeStorage.encryptString(text)])
}

export function decryptText(data: Buffer): string {
  if (!isEncryptedBlob(data)) throw new Error('not a NEXO encrypted blob')
  if (!safeStorage.isEncryptionAvailable()) throw new SecretStoreUnavailableError()
  return safeStorage.decryptString(data.subarray(MAGIC.length))
}
