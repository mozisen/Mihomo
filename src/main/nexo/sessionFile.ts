// nexo 登录会话文件的位置；单独成文件，窗口模块判断“是否已登录”时不必加载整个账户模块。
import { existsSync } from 'fs'
import path from 'path'
import { dataDir } from '../utils/dirs'

export function nexoSessionPath(): string {
  return path.join(dataDir(), 'nexo', 'session.bin')
}

/** 本机是否保存了登录会话（不解密，只看文件是否存在）。 */
export function hasNexoSession(): boolean {
  return existsSync(nexoSessionPath())
}

/**
 * 静默启动只在已登录时生效：没登录就隐藏窗口，用户看不到登录页，软件等于不能用。
 */
export function shouldShowWindowOnStart(opts: {
  silentStart: boolean
  dev: boolean
  loggedIn: boolean
}): boolean {
  return !opts.silentStart || opts.dev || !opts.loggedIn
}
