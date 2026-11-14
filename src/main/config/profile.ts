import { access, mkdtemp, readFile, rm, unlink } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { execFile } from 'child_process'
import { isAbsolute, join, relative, resolve } from 'path'
import { promisify } from 'util'
import { randomBytes } from 'crypto'
import { tmpdir } from 'os'
import { app } from 'electron'
import i18next from 'i18next'
import axios, { AxiosResponse } from 'axios'
import { parse, stringify } from '../utils/yaml'
import { defaultProfile } from '../utils/template'
import { decryptAgeContent } from '../utils/age'
import { DEFAULT_MIHOMO_PORTS } from '../../shared/appConfig'
import { mihomoCloseAllConnections, mihomoHotReloadConfig } from '../core/mihomoApi'
import { checkProfileConfig, restartCore, type CheckProfileOptions } from '../core/manager'
import { generateProfile } from '../core/factory'
import { addProfileUpdater, removeProfileUpdater } from '../core/profileUpdater'
import {
  mihomoCorePath,
  mihomoProfileWorkDir,
  mihomoWorkDir,
  profileConfigPath,
  profilePath
} from '../utils/dirs'
import { createLogger } from '../utils/logger'
import { atomicWriteFile } from '../utils/safeFile'
import { decryptText, encryptText, isEncryptedBlob } from '../nexo/secretStore'
import { isHttpUrl } from '../utils/url'
import type { LocalSubscriptionOptions } from '../../shared/local-config'
import {
  isLocalProfile,
  LEGACY_SIMPLE_PROFILE_ID,
  LOCAL_PROFILE_ID
} from '../../shared/local-config'
import { getAppConfig } from './app'
import { getControledMihomoConfig } from './controledMihomo'
import { runtimeConfigWriteQueue } from './runtimeConfigQueue'

const profileLogger = createLogger('Profile')
const execFilePromise = promisify(execFile)

let profileConfig: IProfileConfig
// 与 override.yaml 共用（见 runtimeConfigQueue.ts）
const profileConfigWriteQueue = runtimeConfigWriteQueue
let changeProfileQueue: Promise<void> = Promise.resolve()
// 并发去重
const inflightRemoteFetches = new Map<string, Promise<IProfileItem>>()

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'EACCES' || code === 'EPERM'
}

function assertInsideWorkDir(targetPath: string): void {
  const relativePath = relative(resolve(mihomoWorkDir()), resolve(targetPath))
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Refusing to delete outside work directory: ${targetPath}`)
  }
}

async function canRemoveProfileWorkDir(workDir: string): Promise<boolean> {
  try {
    await Promise.all([
      access(mihomoWorkDir(), constants.W_OK | constants.X_OK),
      access(workDir, constants.R_OK | constants.W_OK | constants.X_OK)
    ])
    return true
  } catch {
    return false
  }
}

async function removeProfileWorkDirWithPkexec(workDir: string): Promise<void> {
  assertInsideWorkDir(workDir)
  await execFilePromise('pkexec', ['rm', '-rf', '--', workDir])
}

async function removeProfileWorkDir(id: string): Promise<void> {
  const workDir = mihomoProfileWorkDir(id)
  if (!existsSync(workDir)) return
  assertInsideWorkDir(workDir)

  if (process.platform === 'linux' && !(await canRemoveProfileWorkDir(workDir))) {
    await removeProfileWorkDirWithPkexec(workDir)
    return
  }

  try {
    await rm(workDir, { recursive: true, force: true })
  } catch (error) {
    if (process.platform !== 'linux' || !isPermissionError(error)) {
      throw error
    }

    await removeProfileWorkDirWithPkexec(workDir)
  }
}

// 每次经写队列提交的写入 +1：一次迟到的冷加载 / 强制读取不得用旧内容覆盖比它新的缓存（R2-ISS-045 同型）
let profileConfigVersion = 0

export async function getProfileConfig(force = false): Promise<IProfileConfig> {
  if (force || !profileConfig) {
    const seen = profileConfigVersion
    const data = await readFile(profileConfigPath(), 'utf-8')
    const loaded = (parse(data) || { items: [] }) as IProfileConfig
    // 读取期间有写入提交：磁盘与缓存都已比这次读取新，保留缓存
    if (profileConfigVersion === seen || !profileConfig) profileConfig = loaded
  }
  if (typeof profileConfig !== 'object') profileConfig = { items: [] }
  if (!Array.isArray(profileConfig.items)) profileConfig.items = []
  return JSON.parse(JSON.stringify(profileConfig))
}

export async function setProfileConfig(config: IProfileConfig): Promise<void> {
  await profileConfigWriteQueue.run(async () => {
    const nextConfig = JSON.parse(JSON.stringify(config)) as IProfileConfig
    await atomicWriteFile(profileConfigPath(), stringify(nextConfig), { encoding: 'utf8' })
    profileConfig = nextConfig
    profileConfigVersion++
  })
}

// signal 只约束排队等待：它在轮到本次写入之前触发则写入不执行（调用方得到 signal 的 reason）；
// 已经开始的写入一律完成
export async function updateProfileConfig(
  updater: (config: IProfileConfig) => IProfileConfig | Promise<IProfileConfig>,
  signal?: AbortSignal
): Promise<IProfileConfig> {
  return await profileConfigWriteQueue.run(async () => {
    const data = await readFile(profileConfigPath(), 'utf-8')
    const currentConfig = (parse(data) || { items: [] }) as IProfileConfig
    if (typeof currentConfig !== 'object') {
      throw new Error('Profile config is invalid')
    }
    if (!Array.isArray(currentConfig.items)) currentConfig.items = []
    const nextConfig = await updater(JSON.parse(JSON.stringify(currentConfig)))
    await atomicWriteFile(profileConfigPath(), stringify(nextConfig), { encoding: 'utf8' })
    profileConfig = nextConfig
    profileConfigVersion++
    return JSON.parse(JSON.stringify(nextConfig)) as IProfileConfig
  }, signal)
}

export async function getProfileItem(id: string | undefined): Promise<IProfileItem | undefined> {
  const { items } = await getProfileConfig()
  if (!id || id === 'default')
    return { id: 'default', type: 'local', name: i18next.t('profiles.emptyProfile') }
  return items.find((item) => item.id === id)
}

export async function changeCurrentProfile(id: string): Promise<void> {
  // 使用队列确保 profile 切换串行执行，避免竞态条件
  let taskError: unknown = null
  changeProfileQueue = changeProfileQueue
    .catch(() => {})
    .then(async () => {
      const { current } = await getProfileConfig()
      if (current === id) return

      try {
        await updateProfileConfig((config) => {
          config.current = id
          return config
        })
        const { useHotReloadProfile = false, hotReloadProfileAutoCloseConnection = false } =
          await getAppConfig()
        if (useHotReloadProfile) {
          await mihomoHotReloadConfig()
          if (hotReloadProfileAutoCloseConnection) {
            try {
              await mihomoCloseAllConnections()
            } catch (error) {
              profileLogger.warn('Failed to close connections after profile hot reload', error)
            }
          }
        } else {
          await restartCore()
        }
      } catch (e) {
        // 回滚配置
        await updateProfileConfig((config) => {
          config.current = current
          return config
        })
        taskError = e
      }
    })
  await changeProfileQueue
  if (taskError) {
    throw taskError
  }
}

function normalizeCustomHome(value?: string): string | undefined {
  const home = value?.trim()
  if (!home) return undefined
  try {
    const { protocol } = new URL(home)
    if (protocol === 'http:' || protocol === 'https:') return home
  } catch {
    // Report invalid URLs with the same message as unsupported protocols.
  }
  throw new Error(i18next.t('profiles.editInfo.invalidHome'))
}

export async function ensureLocalProfileItem(): Promise<IProfileItem> {
  const config = await getProfileConfig(true)
  const existing = config.items.find(
    (candidate) => candidate.id === LOCAL_PROFILE_ID || candidate.id === LEGACY_SIMPLE_PROFILE_ID
  )
  if (existing?.id === LOCAL_PROFILE_ID && existing.type === 'local' && existing.name)
    return existing
  const translated: unknown = i18next.t('profiles.localProfile')
  const item: IProfileItem = {
    id: LOCAL_PROFILE_ID,
    type: 'local',
    name:
      typeof translated === 'string' && translated && translated !== 'profiles.localProfile'
        ? translated
        : '本地配置',
    updated: Date.now()
  }
  await updateProfileConfig((next) => {
    next.items = next.items.filter(
      (candidate) =>
        candidate.id === existing?.id ||
        (candidate.id !== LOCAL_PROFILE_ID && candidate.id !== LEGACY_SIMPLE_PROFILE_ID)
    )
    const index = next.items.findIndex((candidate) => candidate.id === existing?.id)
    if (index === -1) next.items.push(item)
    else next.items[index] = { ...next.items[index], ...item }
    if (next.current === existing?.id) next.current = LOCAL_PROFILE_ID
    return next
  })
  const { BrowserWindow } = await import('electron')
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('profileConfigUpdated')
  }
  return item
}

export async function updateProfileItem(
  item: IProfileItem,
  sourceOptions?: LocalSubscriptionOptions
): Promise<void> {
  const customHome = normalizeCustomHome(item.customHome)
  const previous = await getProfileItem(item.id)
  await updateProfileConfig((config) => {
    const index = config.items.findIndex((i) => i.id === item.id)
    if (index === -1) {
      throw new Error('Profile not found')
    }
    config.items[index] = { ...item, customHome }
    return config
  })
  if (sourceOptions) {
    try {
      const { configureLocalSource } = await import('../local/service')
      await configureLocalSource(item.id, sourceOptions)
    } catch (error) {
      if (previous) {
        await updateProfileItem(previous)
        try {
          await mihomoHotReloadConfig()
        } catch (restoreError) {
          profileLogger.error('Failed to restore subscription source settings', restoreError)
        }
      }
      throw error
    }
  }
}

export async function addProfileItem(
  item: Partial<IProfileItem>,
  sourceOptions?: LocalSubscriptionOptions
): Promise<IProfileItem> {
  const { getLocalState } = await import('../local/store')
  const localState = await getLocalState()
  const isLocalSource = (profileId: string): boolean =>
    [...localState.draft.sources, ...localState.published.sources].some(
      (source) => source.profileId === profileId
    )
  const newItem = await createProfile(item)
  const sourceProfile = sourceOptions !== undefined || isLocalSource(newItem.id)
  let shouldChangeCurrent = false
  let newProfileIsCurrentAfterUpdate = false
  await updateProfileConfig((config) => {
    const existingIndex = config.items.findIndex((i) => i.id === newItem.id)
    if (existingIndex !== -1) {
      config.items[existingIndex] = newItem
    } else {
      config.items.push(newItem)
    }
    if (!config.current && !sourceProfile) {
      shouldChangeCurrent = true
      newProfileIsCurrentAfterUpdate = true
    }
    return config
  })

  if (sourceProfile) {
    const { configureLocalSource } = await import('../local/service')
    await addProfileUpdater(newItem)
    await configureLocalSource(newItem.id, sourceOptions)
    return newItem
  }

  // If the new profile will become the current profile, ensure generateProfile is called
  // to prepare working directory before restarting core
  if (newProfileIsCurrentAfterUpdate) {
    const { diffWorkDir } = await getAppConfig()
    if (diffWorkDir) {
      try {
        await generateProfile()
      } catch (error) {
        profileLogger.warn('Failed to generate profile for new subscription', error)
      }
    }
  }

  if (shouldChangeCurrent) {
    await changeCurrentProfile(newItem.id)
  }
  await addProfileUpdater(newItem)
  return newItem
}

export async function removeProfileItem(id: string): Promise<void> {
  await withProfileRemoval(id, () => removeProfileItemCore(id))
}

export function withProfileRemoval<T>(id: string, remove: () => Promise<T>): Promise<T> {
  return getProfileItem(id).then((item) => {
    if (!id || !isLocalProfile(item)) return remove()
    return import('../local/service').then(({ withLocalProfileRemoval }) =>
      withLocalProfileRemoval(id, remove)
    )
  })
}

// 正在删除中的 profile：并发删除时不能把彼此选作新的 current
const deletingProfiles = new Set<string>()

// 删除 profile 记录、文件与工作目录，不做插件级联。返回被删除的记录（若存在）。
// 顺序：先让核心不再使用它（切走 current + 重启），再删订阅文件与工作目录，最后删记录。任何一步失败都抛出、
// 定时器装回，而记录仍在列表里可以重试——不会出现"记录没了、含节点凭据的文件还在"的无主残留（R2-ISS-067）。
async function removeProfileItemCore(id: string): Promise<IProfileItem | undefined> {
  deletingProfiles.add(id)
  try {
    return await removeProfileItemSteps(id)
  } finally {
    deletingProfiles.delete(id)
  }
}

function nextCurrentAfter(config: IProfileConfig, removing: string): string | undefined {
  return config.items.find((i) => i.id !== removing && !deletingProfiles.has(i.id))?.id
}

async function removeProfileItemSteps(id: string): Promise<IProfileItem | undefined> {
  const item = (await getProfileConfig()).items.find((i) => i.id === id)
  await removeProfileUpdater(id)

  let removedItem: IProfileItem | undefined
  let repicked = false
  try {
    let switched = false
    await updateProfileConfig((config) => {
      if (config.current === id) {
        switched = true
        config.current = nextCurrentAfter(config, id)
      }
      return config
    })
    if (switched) await restartCore()
    if (existsSync(profilePath(id))) await rm(profilePath(id))
    await removeProfileWorkDir(id)
    await updateProfileConfig((config) => {
      removedItem = config.items?.find((i) => i.id === id)
      config.items = config.items?.filter((i) => i.id !== id)
      // 并发删除可能在我们切走之后又把 current 指回来（对方选 next 时我们还在列表里）：最终一步再核对一次
      if (config.current !== undefined && !config.items.some((i) => i.id === config.current)) {
        config.current = nextCurrentAfter(config, id)
        repicked = true
      }
      return config
    })
  } catch (e) {
    // 记录还在（任何一步失败——配置写入、核心重启、文件 / 工作目录删除）：把定时器装回去，留给用户重试
    if (item) await addProfileUpdater(item)
    throw e
  }
  // 记录已删除：重启失败只需上抛，没有定时器要恢复
  if (repicked) await restartCore()
  return removedItem
}

export async function getCurrentProfileItem(): Promise<IProfileItem> {
  const { current } = await getProfileConfig()
  return (
    (await getProfileItem(current)) || {
      id: 'default',
      type: 'local',
      name: i18next.t('profiles.emptyProfile')
    }
  )
}

interface FetchOptions {
  url: string
  useProxy: boolean
  mixedPort: number
  userAgent: string
  ageSecretKey?: string
  authToken?: string
  timeout: number
  maxAliasCount?: number
}

interface FetchResult {
  data: string
  headers: Record<string, string>
}

const MAX_TIMER_DELAY_MS = 2_147_483_647
const MAX_PROFILE_INTERVAL_MINUTES = Math.floor(MAX_TIMER_DELAY_MS / (60 * 1000))

function redactSubscriptionUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    if (urlObj.username) urlObj.username = '***'
    if (urlObj.password) urlObj.password = '***'
    if (urlObj.search) urlObj.search = '?***'
    return urlObj.toString()
  } catch {
    return url.includes('?') ? `${url.split('?')[0]}?***` : url
  }
}

function normalizeAxiosHeaders(headers: AxiosResponse['headers']): Record<string, string> {
  const normalized: Record<string, string> = {}
  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(', ')
    } else if (value !== undefined) {
      normalized[key.toLowerCase()] = String(value)
    }
  })
  return normalized
}

function profileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '')
    const segment = pathname.split('/').pop()
    if (!segment) return undefined
    const name = decodeURIComponent(segment).replace(/\.(ya?ml|json)$/i, '')
    return name || undefined
  } catch {
    return undefined
  }
}

function parsedProfileSummary(parsed: Record<string, unknown>): string {
  const topKeys = Object.keys(parsed).slice(0, 20)
  const proxies = parsed['proxies']
  const proxyProviders = parsed['proxy-providers']
  const proxyCount = Array.isArray(proxies) ? proxies.length : undefined
  const providerCount =
    proxyProviders && typeof proxyProviders === 'object'
      ? Object.keys(proxyProviders).length
      : undefined

  return JSON.stringify({
    topKeys,
    hasProxies: Boolean(proxies),
    hasProxyProviders: Boolean(proxyProviders),
    proxyCount,
    providerCount
  })
}

async function fetchAndValidateSubscription(options: FetchOptions): Promise<FetchResult> {
  const { url, useProxy, mixedPort, userAgent, authToken, timeout, maxAliasCount } = options
  const redactedUrl = redactSubscriptionUrl(url)
  const fetchMode = useProxy ? 'proxy' : 'direct'

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept-Encoding': 'identity'
  }
  if (authToken) headers['Authorization'] = authToken

  await profileLogger.info(
    `Fetching remote profile url=${redactedUrl} mode=${fetchMode} timeout=${timeout}ms auth=${authToken ? 'yes' : 'no'}`
  )

  const requestUrl = url
  let proxy:
    | {
        protocol: 'http'
        host: string
        port: number
      }
    | false = false

  if (useProxy && mixedPort !== 0) {
    proxy = { protocol: 'http', host: '127.0.0.1', port: mixedPort }
  }

  let res: AxiosResponse<string>
  try {
    res = await axios.get<string>(requestUrl, {
      headers,
      responseType: 'text',
      timeout,
      proxy,
      validateStatus: () => true,
      transformResponse: [(data) => data]
    })
  } catch (error) {
    await profileLogger.warn(
      `Remote profile request failed url=${redactedUrl} mode=${fetchMode}`,
      error
    )
    throw error
  }

  const data = typeof res.data === 'string' ? res.data : String(res.data ?? '')
  const responseHeaders = normalizeAxiosHeaders(res.headers)

  await profileLogger.info(
    `Remote profile response url=${redactedUrl} mode=${fetchMode} status=${res.status} contentType=${String(
      responseHeaders['content-type'] || ''
    )} bytes=${Buffer.byteLength(data, 'utf8')}`
  )

  if (res.status < 200 || res.status >= 300) {
    await profileLogger.warn(
      `Remote profile request rejected url=${redactedUrl} mode=${fetchMode} status=${res.status}`
    )
    throw new Error(`Subscription failed: Request status code ${res.status}`)
  }

  const decryptedData = await decryptAgeContent(data, options.ageSecretKey, 'subscription')
  const parsed = parse(decryptedData, { maxAliasCount }) as Record<string, unknown> | null
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    await profileLogger.warn(
      `Remote profile parse failed url=${redactedUrl} mode=${fetchMode} parsedType=${typeof parsed}`
    )
    throw new Error('Subscription failed: Profile is not a valid YAML')
  }
  await profileLogger.info(
    `Remote profile parsed url=${redactedUrl} mode=${fetchMode} summary=${parsedProfileSummary(parsed)}`
  )
  const hasProxyGroups = Array.isArray(parsed['proxy-groups']) && parsed['proxy-groups'].length > 0
  if (!parsed['proxies'] && !parsed['proxy-providers'] && !hasProxyGroups) {
    await profileLogger.warn(
      `Remote profile validation failed url=${redactedUrl} mode=${fetchMode} reason=missing-proxies-providers-or-groups summary=${parsedProfileSummary(
        parsed
      )}`
    )
    throw new Error('Subscription failed: Profile missing proxies, providers or proxy groups')
  }

  return { data, headers: responseHeaders }
}

export async function createProfile(item: Partial<IProfileItem>): Promise<IProfileItem> {
  const id = item.id || new Date().getTime().toString(16)
  const newItem: IProfileItem = {
    id,
    name: item.name || (item.type === 'remote' ? 'Remote File' : 'Local File'),
    type: item.type || 'local',
    url: item.url,
    home: item.home,
    extra: item.extra,
    customHome: normalizeCustomHome(item.customHome),
    interval: item.interval || 0,
    override: item.override || [],
    useProxy: item.useProxy || false,
    allowFixedInterval: item.allowFixedInterval || false,
    autoUpdate: item.autoUpdate ?? true,
    authToken: item.authToken,
    userAgent: item.userAgent,
    ageSecretKey: item.ageSecretKey,
    updated: new Date().getTime(),
    updateTimeout: item.updateTimeout
  }

  if (newItem.type === 'local') {
    await setProfileStr(id, item.file || '')
    return newItem
  }

  // Remote
  if (!item.url) throw new Error('Empty URL')

  const profileUrl = item.url
  await profileLogger.info(
    `Creating/updating remote profile id=${id} name=${newItem.name} url=${redactSubscriptionUrl(
      profileUrl
    )} useProxy=${newItem.useProxy}`
  )
  const dedupKey = `${id}::${profileUrl}`
  const existing = inflightRemoteFetches.get(dedupKey)
  if (existing) {
    await profileLogger.info(
      `Remote profile fetch deduplicated id=${id} url=${redactSubscriptionUrl(profileUrl)}`
    )
    return existing
  }

  const promise = (async (): Promise<IProfileItem> => {
    const { userAgent, subscriptionTimeout = 30000, yamlMaxAliasCount } = await getAppConfig()
    const { 'mixed-port': mixedPort = DEFAULT_MIHOMO_PORTS.mixed } =
      await getControledMihomoConfig()
    const userItemTimeoutMs =
      typeof newItem.updateTimeout === 'number' && newItem.updateTimeout > 0
        ? newItem.updateTimeout * 1000
        : subscriptionTimeout

    const baseOptions: Omit<FetchOptions, 'useProxy' | 'timeout'> = {
      url: profileUrl,
      mixedPort,
      userAgent: item.userAgent || userAgent || `mihomo.party/v${app.getVersion()} (clash.meta)`,
      ageSecretKey: newItem.ageSecretKey,
      authToken: item.authToken,
      maxAliasCount: yamlMaxAliasCount
    }

    const fetchSub = (useProxy: boolean, timeout: number): Promise<FetchResult> =>
      fetchAndValidateSubscription({ ...baseOptions, useProxy, timeout })

    let result: FetchResult
    if (newItem.useProxy) {
      result = await fetchSub(Boolean(newItem.useProxy), userItemTimeoutMs)
    } else {
      try {
        result = await fetchSub(false, userItemTimeoutMs)
      } catch (directError) {
        await profileLogger.warn(
          `Direct remote profile fetch failed id=${id} url=${redactSubscriptionUrl(
            profileUrl
          )}; trying proxy fallback`,
          directError
        )
        try {
          // smart fallback
          result = await fetchSub(true, subscriptionTimeout)
        } catch {
          throw directError
        }
      }
    }

    const { data, headers } = result

    if (headers['content-disposition'] && newItem.name === 'Remote File') {
      newItem.name = parseFilename(headers['content-disposition'])
    }
    if (isHttpUrl(headers['profile-web-page-url'])) {
      newItem.home = headers['profile-web-page-url']
    }
    if (headers['profile-update-interval'] && !item.allowFixedInterval) {
      const hours = Number(headers['profile-update-interval'])
      if (Number.isFinite(hours) && hours > 0) {
        newItem.interval = Math.min(Math.ceil(hours * 60), MAX_PROFILE_INTERVAL_MINUTES)
      }
    }
    if (headers['subscription-userinfo']) {
      newItem.extra = parseSubinfo(headers['subscription-userinfo'])
    }

    await validateProfileCandidate(newItem, data)
    await setProfileStr(id, data)
    await profileLogger.info(
      `Remote profile saved id=${id} name=${newItem.name} path=${profilePath(
        id
      )} bytes=${Buffer.byteLength(data || '', 'utf8')}`
    )
    return newItem
  })()

  inflightRemoteFetches.set(dedupKey, promise)
  try {
    return await promise
  } finally {
    inflightRemoteFetches.delete(dedupKey)
  }
}

export async function getProfileImportInfo(
  item: Pick<
    IProfileItem,
    'url' | 'useProxy' | 'userAgent' | 'authToken' | 'allowFixedInterval' | 'updateTimeout'
  >
): Promise<Partial<IProfileItem>> {
  if (!item.url) return {}
  const fallbackName = profileNameFromUrl(item.url)
  let userAgent: string | undefined
  let subscriptionTimeout = 30000
  try {
    const appConfig = await getAppConfig()
    userAgent = appConfig.userAgent
    subscriptionTimeout = appConfig.subscriptionTimeout ?? subscriptionTimeout
  } catch {
    // The metadata probe can run before the core configuration is ready.
  }
  let mixedPort: number = DEFAULT_MIHOMO_PORTS.mixed
  try {
    mixedPort = (await getControledMihomoConfig())['mixed-port'] ?? mixedPort
  } catch {
    // Fall back to a direct request when the controlled config is unavailable.
  }
  const headers: Record<string, string> = {
    'User-Agent': item.userAgent || userAgent || `mihomo.party/v${app.getVersion()} (clash.meta)`,
    'Accept-Encoding': 'identity'
  }
  if (item.authToken) headers.Authorization = item.authToken
  const requestUrl = item.url
  let proxy:
    | {
        protocol: 'http'
        host: string
        port: number
      }
    | false = false
  if (item.useProxy && mixedPort !== 0) {
    proxy = { protocol: 'http', host: '127.0.0.1', port: mixedPort }
  }
  const timeout =
    typeof item.updateTimeout === 'number' && item.updateTimeout > 0
      ? item.updateTimeout * 1000
      : subscriptionTimeout
  const request = (requestProxy: typeof proxy) =>
    axios.head(requestUrl, {
      headers,
      timeout,
      proxy: requestProxy,
      validateStatus: () => true
    })
  let response: AxiosResponse
  let responseProxy = proxy
  try {
    response = await request(proxy)
  } catch {
    if (!proxy && mixedPort !== 0) {
      try {
        responseProxy = { protocol: 'http', host: '127.0.0.1', port: mixedPort }
        response = await request(responseProxy)
      } catch {
        return fallbackName ? { name: fallbackName } : {}
      }
    } else {
      return fallbackName ? { name: fallbackName } : {}
    }
  }
  if ((response.status < 200 || response.status >= 300) && !proxy && mixedPort !== 0) {
    try {
      responseProxy = { protocol: 'http', host: '127.0.0.1', port: mixedPort }
      response = await request(responseProxy)
    } catch {
      // Keep the direct response and use the URL fallback below.
    }
  }
  let responseHeaders =
    response.status >= 200 && response.status < 300 ? normalizeAxiosHeaders(response.headers) : {}
  const metadataHeaders = [
    'content-disposition',
    'profile-web-page-url',
    'profile-update-interval',
    'subscription-userinfo'
  ]
  if (!metadataHeaders.some((name) => responseHeaders[name])) {
    try {
      const fallback = await axios.get(requestUrl, {
        headers,
        timeout,
        proxy: responseProxy,
        responseType: 'stream',
        validateStatus: () => true
      })
      responseHeaders = normalizeAxiosHeaders(fallback.headers)
      const stream = fallback.data as { destroy?: () => void }
      stream?.destroy?.()
    } catch {
      // A metadata probe must not block importing the subscription.
    }
  }
  const result: Partial<IProfileItem> = fallbackName ? { name: fallbackName } : {}
  if (responseHeaders['content-disposition']) {
    const name = parseFilename(responseHeaders['content-disposition'])
    if (name !== 'Remote File') result.name = name
  }
  if (!result.name) result.name = fallbackName
  if (isHttpUrl(responseHeaders['profile-web-page-url']))
    result.home = responseHeaders['profile-web-page-url']
  if (responseHeaders['profile-update-interval'] && !item.allowFixedInterval) {
    const hours = Number(responseHeaders['profile-update-interval'])
    if (Number.isFinite(hours) && hours > 0)
      result.interval = Math.min(Math.ceil(hours * 60), MAX_PROFILE_INTERVAL_MINUTES)
  }
  if (responseHeaders['subscription-userinfo'])
    result.extra = parseSubinfo(responseHeaders['subscription-userinfo'])
  return result
}

// 候选校验：把新内容放进临时目录，生成带 override 的完整运行配置，再交核心 `-t` 校验。远程订阅与插件订阅
// 共用；失败抛错，调用方保留旧文件。
export async function validateProfileCandidate(
  item: IProfileItem,
  content: string,
  opts: CheckProfileOptions & { globalOverrideIds?: string[] } = {}
): Promise<void> {
  const candidateDir = await mkdtemp(join(tmpdir(), 'mihomo-party-profile-'))
  const candidatePath = join(candidateDir, 'config.yaml')

  try {
    const { core = 'mihomo' } = await getAppConfig()
    const baseProfile = await parseProfileContent(item.id, content, item.ageSecretKey)
    const { getLocalState } = await import('../local/store')
    const localState = await getLocalState()
    const isLocalSource = [...localState.draft.sources, ...localState.published.sources].some(
      (source) => source.profileId === item.id
    )
    if (isLocalSource) {
      const [{ compileLocalConfig }, { resolveLocalDraft }, { getLocalState }] = await Promise.all([
        import('../local/compiler'),
        import('../local/subscriptions'),
        import('../local/store')
      ])
      const state = await getLocalState()
      const draft = await resolveLocalDraft(state.published, { item, config: baseProfile })
      if (!draft.sources.some((source) => source.profileId === item.id && source.mode !== 'http')) {
        draft.sources.push({
          id: `candidate-${item.id}`,
          name: `candidate-${item.id}`,
          mode: 'inline',
          prefix: '',
          interval: 0,
          proxies: (baseProfile?.proxies || []) as Record<string, unknown>[]
        })
      }
      const result = compileLocalConfig(draft, await getControledMihomoConfig())
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      await atomicWriteFile(candidatePath, result.yaml, { encoding: 'utf8' })
      await checkProfileConfig(candidatePath, core, undefined, opts)
      return
    }
    await generateProfile(undefined, {
      profileId: item.id,
      baseProfile,
      ageSecretKey: item.ageSecretKey,
      profileOverrideIds: item.override ?? [],
      globalOverrideIds: opts.globalOverrideIds,
      outputPath: candidatePath,
      updateRuntimeConfig: false
    })
    await checkProfileConfig(candidatePath, core, item.ageSecretKey, opts)
  } finally {
    await rm(candidateDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function getProfileStr(id: string | undefined): Promise<string> {
  if (existsSync(profilePath(id || 'default'))) {
    const raw = await readFile(profilePath(id || 'default'))
    // NEXO 账户订阅以本机加密形式落盘，只在主进程内解密
    return isEncryptedBlob(raw) ? decryptText(raw) : raw.toString('utf-8')
  } else {
    return stringify(defaultProfile)
  }
}

export async function setProfileStr(id: string, content: string): Promise<void> {
  // 读取最新的配置
  const { current } = await getProfileConfig(true)
  const currentItem = await getProfileItem(current)
  if (isLocalProfile(currentItem)) {
    const { getLocalState } = await import('../local/store')
    const state = await getLocalState()
    const linked = state.published.sources.some((source) => source.profileId === id)
    const item = await getProfileItem(id)
    if (linked && item) {
      await validateProfileCandidate(item, content)
      const previous = await getProfileStr(id)
      await atomicWriteFile(profilePath(id), content, { encoding: 'utf8' })
      try {
        await mihomoHotReloadConfig()
      } catch (error) {
        await atomicWriteFile(profilePath(id), previous, { encoding: 'utf8' })
        try {
          await mihomoHotReloadConfig()
        } catch (restoreError) {
          profileLogger.error('Failed to restore subscription source config', restoreError)
        }
        throw error
      }
      return
    }
    await atomicWriteFile(profilePath(id), content, { encoding: 'utf8' })
    if (id === current) {
      const { importLocalProfileContent } = await import('../local/store')
      await importLocalProfileContent(content)
    }
    return
  }
  await atomicWriteFile(profilePath(id), content, { encoding: 'utf8' })
  if (current === id) await reloadCurrentProfile()
}

export const NEXO_PROFILE_ID = 'nexo'

export function isNexoProfileId(id: string | undefined): boolean {
  return id === NEXO_PROFILE_ID
}

// NEXO 账户订阅：校验通过后加密写入 profiles/nexo.yaml，并设为当前订阅（已是当前则热加载）。
export async function upsertNexoProfile(
  content: string,
  meta: { name: string; extra?: ISubscriptionUserInfo }
): Promise<void> {
  const snapshot = await getProfileItem(NEXO_PROFILE_ID)
  const item: IProfileItem = {
    ...snapshot,
    id: NEXO_PROFILE_ID,
    type: 'local',
    name: meta.name,
    nexo: true,
    extra: meta.extra,
    updated: Date.now()
  }
  await validateProfileCandidate(item, content)
  const encrypted = encryptText(content)
  let wasCurrent = false
  await updateProfileConfig(async (config) => {
    await atomicWriteFile(profilePath(NEXO_PROFILE_ID), encrypted)
    const idx = config.items.findIndex((i) => i.id === NEXO_PROFILE_ID)
    if (idx === -1) config.items.push(item)
    else config.items[idx] = { ...config.items[idx], ...item }
    wasCurrent = config.current === NEXO_PROFILE_ID
    return config
  })
  if (wasCurrent) await reloadCurrentProfile()
  else await changeCurrentProfile(NEXO_PROFILE_ID)
}

export async function removeNexoProfile(): Promise<void> {
  const item = (await getProfileConfig()).items.find((i) => i.id === NEXO_PROFILE_ID)
  if (item) await removeProfileItem(NEXO_PROFILE_ID)
  else if (existsSync(profilePath(NEXO_PROFILE_ID))) await rm(profilePath(NEXO_PROFILE_ID))
}

// 启动时（内核尚未运行）清掉 NEXO 订阅：只改记录与文件，不重启内核
export async function purgeNexoProfileOffline(): Promise<void> {
  await updateProfileConfig((config) => {
    config.items = config.items.filter((i) => i.id !== NEXO_PROFILE_ID)
    if (config.current === NEXO_PROFILE_ID) config.current = config.items[0]?.id
    return config
  })
  await rm(profilePath(NEXO_PROFILE_ID), { force: true })
  await removeProfileWorkDir(NEXO_PROFILE_ID)
}

// 当前订阅的内容已替换：热加载，失败则回退到重启核心
async function reloadCurrentProfile(): Promise<void> {
  try {
    await mihomoHotReloadConfig()
    profileLogger.info('Config reloaded successfully')
  } catch (error) {
    profileLogger.error('Failed to reload config', error)
    try {
      profileLogger.info('Falling back to restart core')
      await restartCore()
      profileLogger.info('Core restarted successfully')
    } catch (restartError) {
      profileLogger.error('Failed to restart core', restartError)
      throw restartError
    }
  }
}

export async function getProfile(id: string | undefined): Promise<IMihomoConfig> {
  const item = await getProfileItem(id)
  return await parseProfileContent(id, await getProfileStr(id), item?.ageSecretKey)
}

export async function parseProfileContent(
  id: string | undefined,
  content: string,
  ageSecretKey?: string
): Promise<IMihomoConfig> {
  const profile = await decryptAgeContent(content, ageSecretKey, `profile "${id || 'default'}"`)

  // 检测是否为 HTML 内容（订阅返回错误页面）
  const trimmed = profile.trim()
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML') ||
    /<style[^>]*>/i.test(trimmed.slice(0, 500))
  ) {
    throw new Error(
      `Profile "${id}" contains HTML instead of YAML. The subscription may have returned an error page. Please re-import or update the subscription.`
    )
  }

  try {
    const { yamlMaxAliasCount } = await getAppConfig()
    let result = parse(profile, { maxAliasCount: yamlMaxAliasCount })
    if (typeof result !== 'object') result = {}
    return result as IMihomoConfig
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to parse profile "${id}": ${msg}`)
  }
}

// attachment;filename=xxx.yaml; filename*=UTF-8''%xx%xx%xx
function parseFilename(str: string): string {
  if (str.match(/filename\*=.*''/)) {
    const parts = str.split(/filename\*=.*''/)
    if (parts[1]) {
      return decodeURIComponent(parts[1])
    }
  }
  const parts = str.split('filename=')
  if (parts[1]) {
    return parts[1].replace(/^["']|["']$/g, '')
  }
  return 'Remote File'
}

// subscription-userinfo: upload=1234; download=2234; total=1024000; expire=2218532293
function parseSubinfo(str: string): ISubscriptionUserInfo {
  const parts = str.split(/\s*;\s*/)
  const obj = {} as ISubscriptionUserInfo
  parts.forEach((part) => {
    const [key, value] = part.split('=')
    obj[key] = Number(value)
  })
  return obj
}

export async function getFileStr(path: string): Promise<string> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolute(path)) {
    return await readFile(path, 'utf-8')
  } else {
    return await readFile(
      join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path),
      'utf-8'
    )
  }
}

export async function setFileStr(path: string, content: string): Promise<void> {
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  if (isAbsolute(path)) {
    await atomicWriteFile(path, content, { encoding: 'utf8' })
  } else {
    await atomicWriteFile(
      join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), path),
      content,
      { encoding: 'utf8' }
    )
  }
}

const MRS_RULESET_BEHAVIORS = ['domain', 'ipcidr', 'classical'] as const

export async function convertMrsRuleset(filePath: string, behavior: string): Promise<string> {
  // behavior 来自订阅下发的 rule-providers，属于不可信输入，只接受内核支持的固定取值
  if (!(MRS_RULESET_BEHAVIORS as readonly string[]).includes(behavior)) {
    throw new Error(`Unsupported ruleset behavior: ${behavior}`)
  }

  const { core = 'mihomo' } = await getAppConfig()
  const corePath = mihomoCorePath(core)
  const { diffWorkDir = false } = await getAppConfig()
  const { current } = await getProfileConfig()
  let fullPath: string
  if (isAbsolute(filePath)) {
    fullPath = filePath
  } else {
    fullPath = join(diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(), filePath)
  }

  const tempFileName = `mrs-convert-${randomBytes(8).toString('hex')}.txt`
  const tempFilePath = join(tmpdir(), tempFileName)

  try {
    // 使用 mihomo convert-ruleset 命令转换 MRS 文件为 text 格式
    // 命令格式：mihomo convert-ruleset <behavior> <format> <source>
    // 用 execFile 传参数数组，避免 behavior / 路径经过 shell 解析导致命令注入
    await execFilePromise(corePath, ['convert-ruleset', behavior, 'mrs', fullPath, tempFilePath])
    const content = await readFile(tempFilePath, 'utf-8')
    await unlink(tempFilePath)

    return content
  } catch (error) {
    try {
      await unlink(tempFilePath)
    } catch {
      // ignore
    }
    throw error
  }
}
