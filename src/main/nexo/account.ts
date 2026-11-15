// NEXO 账户在主进程中的实例：会话加密存盘、订阅加密写入、状态推送给渲染进程。
import { existsSync } from 'fs'
import { mkdir, readFile, rm } from 'fs/promises'
import { hostname } from 'os'
import path from 'path'
import { app } from 'electron'
import {
  NEXO_PROFILE_ID,
  getProfileConfig,
  purgeNexoProfileOffline,
  removeNexoProfile,
  upsertNexoProfile
} from '../config/profile'
import { dataDir, mihomoProfileWorkDir, mihomoWorkDir, profilesDir } from '../utils/dirs'
import { createLogger } from '../utils/logger'
import { atomicWriteFile } from '../utils/safeFile'
import { getRuntimeConfig } from '../core/factory'
import { NexoAccountService, type NexoAccountState, type NexoSession } from './accountService'
import { MasterClient } from './client'
import { type NexoGuardContext } from './ipcGuard'
import { errorCode, errorDetail } from './errors'
import { decryptText, encryptText } from './secretStore'
import { scheduleUpdateCheck } from './update'

/** 妙妙屋X 主控地址（经 ECHO 反代）。 */
export const NEXO_MASTER_URL = 'https://mx.voee.de'

const logger = createLogger('NEXO')

function sessionPath(): string {
  return path.join(dataDir(), 'nexo', 'session.bin')
}

async function notifyRenderer(channel: string, payload?: unknown): Promise<void> {
  const { mainWindow } = await import('../window')
  mainWindow?.webContents.send(channel, payload)
}

let service: NexoAccountService | undefined

export function nexoAccount(): NexoAccountService {
  if (!service) {
    service = new NexoAccountService({
      client: new MasterClient({
        baseUrl: NEXO_MASTER_URL,
        // 主控按 UA 识别客户端类型，下发 mihomo 格式的订阅
        userAgent: `mihomo/1.19 NEXO/${app.getVersion()}`
      }),
      deviceName: () => hostname() || process.platform,
      loadSession: async () => {
        if (!existsSync(sessionPath())) return undefined
        return JSON.parse(decryptText(await readFile(sessionPath()))) as NexoSession
      },
      saveSession: async (session) => {
        await mkdir(path.dirname(sessionPath()), { recursive: true })
        await atomicWriteFile(sessionPath(), encryptText(JSON.stringify(session)))
      },
      clearSession: async () => {
        await rm(sessionPath(), { force: true })
      },
      applyProfile: async (content, meta) => {
        await upsertNexoProfile(content, {
          name: meta.name,
          extra: meta.userInfo && { expire: 0, ...meta.userInfo }
        })
        await notifyRenderer('profileConfigUpdated')
      },
      removeProfile: async () => {
        await removeNexoProfile()
        await notifyRenderer('profileConfigUpdated')
      },
      purgeProfileOffline: purgeNexoProfileOffline,
      onChange: (state) => {
        void notifyRenderer('nexoAccountChanged', state)
        // 打开软件并登录后检查一次更新
        if (state.status === 'loggedIn') scheduleUpdateCheck()
      },
      log: { info: (m) => logger.info(m), warn: (m, e) => logger.warn(m, e) }
    })
  }
  return service
}

/** 启动内核前调用：恢复登录状态；未登录时清掉残留的 NEXO 订阅。 */
export async function initNexoAccount(): Promise<void> {
  try {
    await nexoAccount().init()
  } catch (e) {
    logger.error('Failed to initialize NEXO account', e)
  }
}

/** 内核启动后调用：已登录则自动更新一次配置。 */
export function syncNexoAccountInBackground(): void {
  const account = nexoAccount()
  if (account.isLoggedIn()) void account.sync().catch(() => {})
}

// ---- IPC ----

/** 把主控错误转成渲染进程可本地化的错误码，并附上便于排查的简短详情。 */
async function withCode<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    logger.warn('NEXO account request failed', e)
    throw new Error(`NEXO:${errorCode(e)}|${errorDetail(e)}`)
  }
}

export async function nexoGetAccountState(): Promise<NexoAccountState> {
  return nexoAccount().getState()
}

export async function nexoLogin(username: string, password: string): Promise<NexoAccountState> {
  return await withCode(() => nexoAccount().login(String(username), String(password)))
}

export async function nexoLogin2fa(code: string): Promise<NexoAccountState> {
  return await withCode(() => nexoAccount().login2fa(String(code)))
}

export async function nexoCancel2fa(): Promise<void> {
  nexoAccount().cancel2fa()
}

export async function nexoLogout(): Promise<void> {
  await nexoAccount().logout()
}

export async function nexoRefresh(): Promise<NexoAccountState> {
  await withCode(() => nexoAccount().sync())
  return nexoAccount().getState()
}

export async function nexoRefreshOnline(): Promise<NexoAccountState> {
  await nexoAccount().refreshOnline()
  return nexoAccount().getState()
}

// ---- 订阅内容保护 ----

async function isNexoActive(): Promise<boolean> {
  return (await getProfileConfig()).current === NEXO_PROFILE_ID
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export const nexoGuardContext: NexoGuardContext = {
  profileId: NEXO_PROFILE_ID,
  isNexoActive,
  isProtectedFile: async (file) => {
    const workDir = mihomoWorkDir()
    const resolved = path.resolve(workDir, file)
    if (isInside(resolved, profilesDir())) return true
    if (isInside(resolved, mihomoProfileWorkDir(NEXO_PROFILE_ID))) {
      // NEXO 工作目录里除规则集外都可能含节点（运行配置、代理集合缓存）
      return !isRuleProviderFile(resolved, await getRuntimeConfig())
    }
    if (!(await isNexoActive())) return false
    if (path.basename(resolved) === 'config.yaml') return true
    return !isRuleProviderFile(resolved, await getRuntimeConfig())
  }
}

function isRuleProviderFile(file: string, config: IMihomoConfig): boolean {
  const providers = (config['rule-providers'] ?? {}) as Record<string, { path?: string }>
  return Object.values(providers).some((p) => {
    if (!p?.path) return false
    // 运行配置里的相对路径相对于当前工作目录
    const base = mihomoProfileWorkDir(NEXO_PROFILE_ID)
    return [path.resolve(base, p.path), path.resolve(mihomoWorkDir(), p.path)].includes(file)
  })
}
