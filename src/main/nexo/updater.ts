// nexo 自动更新：从 ECHO（https://echo.voee.de/nexo/）读取版本清单，提示后下载安装包、
// 校验 SHA-256，再交给系统打开安装程序并退出应用。依赖全部注入，便于单元测试。
import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import path from 'path'

export const UPDATE_BASE_URL = 'https://echo.voee.de/nexo/'
export const UPDATE_MANIFEST_URL = `${UPDATE_BASE_URL}latest.json`

export interface UpdateAsset {
  /** 安装包文件名，与清单放在同一目录 */
  file: string
  sha256: string
  size?: number
}

export interface UpdateManifest {
  version: string
  notes?: string
  releasedAt?: string
  /** 平台 → 架构 → 安装包，例如 win32.x64 */
  assets?: Record<string, Record<string, UpdateAsset> | undefined>
}

export interface AvailableUpdate {
  version: string
  notes?: string
  url: string
  file: string
  sha256: string
  size?: number
}

/** 比较 x.y.z 版本号（忽略前缀 v 与预发布后缀）。 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** 从清单中找出比当前版本新、且适用于本机的安装包；清单不合规时返回 undefined。 */
export function pickUpdate(
  manifest: UpdateManifest,
  current: string,
  platform: string,
  arch: string
): AvailableUpdate | undefined {
  if (typeof manifest?.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    return undefined
  }
  if (compareVersions(manifest.version, current) <= 0) return undefined
  const asset = manifest.assets?.[platform]?.[arch]
  if (!asset || typeof asset.file !== 'string' || typeof asset.sha256 !== 'string') return undefined
  // 只接受同目录下的普通文件名，安装包只能来自 ECHO
  if (!/^[\w.-]+$/.test(asset.file) || asset.file.startsWith('.')) return undefined
  if (!/^[0-9a-f]{64}$/i.test(asset.sha256)) return undefined
  return {
    version: manifest.version,
    notes: typeof manifest.notes === 'string' ? manifest.notes : undefined,
    url: new URL(asset.file, UPDATE_BASE_URL).toString(),
    file: asset.file,
    sha256: asset.sha256.toLowerCase(),
    size: typeof asset.size === 'number' ? asset.size : undefined
  }
}

export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface UpdaterDeps {
  currentVersion: string
  platform: string
  arch: string
  /** 下载安装包的目录 */
  downloadDir: string
  fetch?: UpdateFetch
  /** 询问用户是否立即更新 */
  confirm: (update: AvailableUpdate) => Promise<boolean>
  /** 下载进度 0–1；结束时传 -1 */
  onProgress?: (ratio: number) => void
  /** 打开安装程序（返回错误信息，空串表示成功） */
  launch: (file: string) => Promise<string>
  quit: () => void
  /** 下载或安装失败时告知用户 */
  reportError?: (message: string) => Promise<void> | void
  log?: { info: (msg: string) => void; warn: (msg: string, e?: unknown) => void }
}

export class Updater {
  private checked = false
  private busy = false

  constructor(private readonly deps: UpdaterDeps) {}

  private get fetchImpl(): UpdateFetch {
    return this.deps.fetch ?? ((u, i) => fetch(u, i))
  }

  /** 读取版本清单；没有新版本或清单不可用时返回 undefined。 */
  async check(): Promise<AvailableUpdate | undefined> {
    const { currentVersion, platform, arch } = this.deps
    const res = await this.fetchImpl(UPDATE_MANIFEST_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    })
    if (res.status === 404) return undefined
    if (!res.ok) throw new Error(`update manifest unavailable (HTTP ${res.status})`)
    const manifest = (await res.json()) as UpdateManifest
    return pickUpdate(manifest, currentVersion, platform, arch)
  }

  /** 每次启动只检查一次（打开软件并登录后调用）。 */
  async checkOnce(): Promise<void> {
    if (this.checked) return
    this.checked = true
    await this.checkAndPrompt()
  }

  async checkAndPrompt(): Promise<void> {
    if (this.busy) return
    this.busy = true
    const { log } = this.deps
    try {
      let update: AvailableUpdate | undefined
      try {
        update = await this.check()
      } catch (e) {
        log?.warn('nexo update check failed', e)
        return
      }
      if (!update) {
        log?.info(`nexo is up to date (${this.deps.currentVersion})`)
        return
      }
      log?.info(`nexo update available: ${update.version}`)
      if (!(await this.deps.confirm(update))) return
      try {
        const file = await this.download(update)
        const error = await this.deps.launch(file)
        if (error) throw new Error(error)
        this.deps.quit()
      } catch (e) {
        log?.warn('nexo update install failed', e)
        await this.deps.reportError?.(e instanceof Error ? e.message : String(e))
      }
    } finally {
      this.busy = false
    }
  }

  /** 下载到 downloadDir 并校验大小与 SHA-256，返回本地路径。 */
  async download(update: AvailableUpdate): Promise<string> {
    const { downloadDir, onProgress } = this.deps
    await mkdir(downloadDir, { recursive: true })
    const target = path.join(downloadDir, update.file)
    const res = await this.fetchImpl(update.url, { signal: AbortSignal.timeout(30 * 60_000) })
    if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`)
    const total = update.size ?? (Number(res.headers.get('content-length')) || 0)
    const hash = createHash('sha256')
    const out = createWriteStream(target)
    let received = 0
    try {
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        received += value.length
        if (!out.write(value)) await new Promise((r) => out.once('drain', r))
        if (total > 0) onProgress?.(Math.min(1, received / total))
      }
      await new Promise<void>((resolve, reject) =>
        out.end((e?: Error | null) => (e ? reject(e) : resolve()))
      )
      if (update.size !== undefined && received !== update.size) {
        throw new Error(`size mismatch: expected ${update.size}, got ${received}`)
      }
      const digest = hash.digest('hex')
      if (digest !== update.sha256) throw new Error('installer checksum mismatch')
      return target
    } catch (e) {
      out.destroy()
      await rm(target, { force: true })
      throw e
    } finally {
      onProgress?.(-1)
    }
  }
}
