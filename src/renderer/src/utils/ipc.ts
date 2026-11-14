import { TitleBarOverlayOptions } from 'electron'
import type {
  TrafficUsageAggregate,
  TrafficUsageBreakdownQuery,
  TrafficUsageDimension,
  TrafficUsageImportBatch,
  TrafficUsageOverview
} from '../../../shared/trafficUsage'
import type { NexoAccountState } from '../../../shared/nexo'

function checkIpcError<T>(response: unknown): T {
  if (response && typeof response === 'object' && 'invokeError' in response) {
    throw (response as { invokeError: unknown }).invokeError
  }
  return response as T
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await window.electron.ipcRenderer.invoke(channel, ...args)
  return checkIpcError<T>(response)
}

// IPC API 类型定义
interface IpcApi {
  // NEXO account
  nexoGetAccountState: () => Promise<NexoAccountState>
  nexoLogin: (username: string, password: string) => Promise<NexoAccountState>
  nexoLogin2fa: (code: string) => Promise<NexoAccountState>
  nexoCancel2fa: () => Promise<void>
  nexoLogout: () => Promise<void>
  nexoRefresh: () => Promise<NexoAccountState>
  nexoRefreshOnline: () => Promise<NexoAccountState>
  // Mihomo API
  mihomoVersion: () => Promise<IMihomoVersion>
  mihomoCloseConnection: (id: string) => Promise<void>
  mihomoCloseAllConnections: (group?: string) => Promise<void>
  mihomoRules: () => Promise<IMihomoRulesInfo>
  mihomoRulesDisable: (rules: Record<string, boolean>) => Promise<void>
  mihomoProxies: () => Promise<IMihomoProxies>
  mihomoGroups: (includeHidden?: boolean) => Promise<IMihomoMixedGroup[]>
  mihomoProxyProviders: () => Promise<IMihomoProxyProviders>
  mihomoUpdateProxyProviders: (name: string) => Promise<void>
  mihomoRuleProviders: () => Promise<IMihomoRuleProviders>
  mihomoUpdateRuleProviders: (name: string) => Promise<void>
  mihomoChangeProxy: (group: string, proxy: string) => Promise<IMihomoProxy>
  mihomoUnfixedProxy: (group: string) => Promise<IMihomoProxy>
  mihomoUpgradeGeo: () => Promise<void>
  mihomoUpgrade: () => Promise<void>
  mihomoUpgradeUI: () => Promise<void>
  mihomoProxyDelay: (proxy: string, url?: string, provider?: string) => Promise<IMihomoDelay>
  mihomoGroupDelay: (group: string, url?: string) => Promise<IMihomoGroupDelay>
  patchMihomoConfig: (patch: Partial<IMihomoConfig>) => Promise<void>
  mihomoSmartGroupWeights: (groupName: string) => Promise<Record<string, number>>
  mihomoSmartFlushCache: (configName?: string) => Promise<void>
  queryTrafficUsageOverview: (
    type: TrafficUsageDimension,
    startTime: number,
    endTime: number,
    bucketSizeMs: number
  ) => Promise<TrafficUsageOverview>
  queryTrafficUsageBreakdown: (
    query: TrafficUsageBreakdownQuery
  ) => Promise<TrafficUsageAggregate[]>
  importTrafficUsage: (batch: TrafficUsageImportBatch) => Promise<void>
  clearTrafficUsage: () => Promise<void>
  // AutoRun
  checkAutoRun: () => Promise<boolean>
  enableAutoRun: () => Promise<void>
  disableAutoRun: () => Promise<void>
  // Config
  getAppConfig: (force?: boolean) => Promise<IAppConfig>
  patchAppConfig: (patch: Partial<IAppConfig>) => Promise<void>
  setControlDns: (enabled: boolean, confirmation?: string) => Promise<IControlDnsApplyResult>
  takeDnsOverrideAutoDisabledNotice: () => Promise<boolean>
  getControledMihomoConfig: (force?: boolean) => Promise<Partial<IMihomoConfig>>
  patchControledMihomoConfig: (patch: Partial<IMihomoConfig>) => Promise<void>
  resetAppConfig: () => Promise<void>
  // Profile
  localSwitchNeedsDnsConfirm: (targetId: string) => Promise<boolean>
  getProfileConfig: (force?: boolean) => Promise<IProfileConfig>
  setProfileConfig: (config: IProfileConfig) => Promise<void>
  getCurrentProfileItem: () => Promise<IProfileItem>
  getProfileItem: (id: string | undefined) => Promise<IProfileItem>
  addProfileItem: (
    item: Partial<IProfileItem>,
    localOptions?: import('../../../shared/local-config').LocalSubscriptionOptions
  ) => Promise<IProfileItem>
  removeProfileItem: (id: string) => Promise<void>
  updateProfileItem: (
    item: IProfileItem,
    localOptions?: import('../../../shared/local-config').LocalSubscriptionOptions
  ) => Promise<void>
  changeCurrentProfile: (id: string) => Promise<void>
  addProfileUpdater: (item: IProfileItem) => Promise<void>
  removeProfileUpdater: (id: string) => Promise<void>
  // Override
  getOverrideConfig: (force?: boolean) => Promise<IOverrideConfig>
  setOverrideConfig: (config: IOverrideConfig) => Promise<void>
  addOverrideItem: (item: Partial<IOverrideItem>) => Promise<void>
  removeOverrideItem: (id: string) => Promise<void>
  updateOverrideItem: (item: IOverrideItem) => Promise<void>
  // File
  getFileStr: (path: string) => Promise<string>
  setFileStr: (path: string, str: string) => Promise<void>
  convertMrsRuleset: (path: string, behavior: string) => Promise<string>
  getRuntimeConfig: () => Promise<IMihomoConfig>
  getFilePath: (ext: string[], title?: string, filterName?: string) => Promise<string[] | undefined>
  readImageFileDataURL: (filePath: string) => Promise<string>
  // Core
  restartCore: () => Promise<void>
  getSmartModelStatus: () => Promise<ISmartModelStatus>
  downloadSmartModel: (variant: SmartModelVariant) => Promise<ISmartModelStatus>
  mihomoHotReloadConfig: () => Promise<void>
  startMonitor: () => Promise<void>
  quitWithoutCore: () => Promise<void>
  // System
  triggerSysProxy: (enable: boolean) => Promise<void>
  checkTunPermissions: () => Promise<boolean>
  grantTunPermissions: () => Promise<void>
  manualGrantCorePermition: () => Promise<void>
  checkAdminPrivileges: () => Promise<boolean>
  restartAsAdmin: () => Promise<void>
  checkMihomoCorePermissions: () => Promise<boolean>
  checkHighPrivilegeCore: () => Promise<boolean>
  showTunPermissionDialog: () => Promise<boolean>
  showErrorDialog: (title: string, message: string) => Promise<void>
  openUWPTool: () => Promise<void>
  setupFirewall: () => Promise<void>
  getInterfaces: () => Promise<Record<string, NetworkInterfaceInfo[]>>
  setNativeTheme: (theme: 'system' | 'light' | 'dark') => Promise<void>
  copyEnv: (type: 'bash' | 'cmd' | 'powershell' | 'fish' | 'nushell') => Promise<void>
  // Update
  getVersion: () => Promise<string>
  platform: () => Promise<NodeJS.Platform>
  fetchMihomoTags: (
    forceRefresh?: boolean
  ) => Promise<{ name: string; zipball_url: string; tarball_url: string }[]>
  installSpecificMihomoCore: (version: string) => Promise<void>
  clearMihomoVersionCache: () => Promise<void>
  // Tray
  showTrayIcon: () => Promise<void>
  closeTrayIcon: () => Promise<void>
  updateTrayIcon: () => Promise<void>
  getTrayTrafficStyle: () => Promise<ITrayTrafficStyle>
  // Window
  showMainWindow: () => Promise<void>
  closeMainWindow: () => Promise<void>
  triggerMainWindow: () => Promise<void>
  showFloatingWindow: () => Promise<void>
  closeFloatingWindow: () => Promise<void>
  showContextMenu: () => Promise<void>
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>
  isAlwaysOnTop: () => Promise<boolean>
  openDevTools: () => Promise<void>
  // Shortcut
  registerShortcut: (oldShortcut: string, newShortcut: string, action: string) => Promise<boolean>
  // Misc
  fetchIPInfo: (url: string) => Promise<unknown>
  measureLatency: (url: string) => Promise<number | null>
  getImageDataURL: (url: string) => Promise<string>
  relaunchApp: () => Promise<void>
  quitApp: () => Promise<void>
}

// 使用 Proxy 自动生成 IPC 调用
const ipc = new Proxy({} as IpcApi, {
  get:
    <K extends keyof IpcApi>(_: IpcApi, channel: K) =>
    (...args: Parameters<IpcApi[K]>) =>
      invoke(channel, ...args)
})

// 导出所有 IPC 方法
export const {
  // NEXO account
  nexoGetAccountState,
  nexoLogin,
  nexoLogin2fa,
  nexoCancel2fa,
  nexoLogout,
  nexoRefresh,
  nexoRefreshOnline,
  // Mihomo API
  mihomoVersion,
  mihomoCloseConnection,
  mihomoCloseAllConnections,
  mihomoRules,
  mihomoRulesDisable,
  mihomoProxies,
  mihomoGroups,
  mihomoProxyProviders,
  mihomoUpdateProxyProviders,
  mihomoRuleProviders,
  mihomoUpdateRuleProviders,
  mihomoChangeProxy,
  mihomoUnfixedProxy,
  mihomoUpgradeGeo,
  mihomoUpgrade,
  mihomoUpgradeUI,
  mihomoProxyDelay,
  mihomoGroupDelay,
  patchMihomoConfig,
  mihomoSmartGroupWeights,
  mihomoSmartFlushCache,
  queryTrafficUsageOverview,
  queryTrafficUsageBreakdown,
  importTrafficUsage,
  clearTrafficUsage,
  // AutoRun
  checkAutoRun,
  enableAutoRun,
  disableAutoRun,
  // Config
  getAppConfig,
  patchAppConfig,
  setControlDns,
  takeDnsOverrideAutoDisabledNotice,
  getControledMihomoConfig,
  patchControledMihomoConfig,
  resetAppConfig,
  // Profile
  localSwitchNeedsDnsConfirm,
  getProfileConfig,
  setProfileConfig,
  getCurrentProfileItem,
  getProfileItem,
  addProfileItem,
  removeProfileItem,
  updateProfileItem,
  changeCurrentProfile,
  addProfileUpdater,
  removeProfileUpdater,
  // Override
  getOverrideConfig,
  setOverrideConfig,
  addOverrideItem,
  removeOverrideItem,
  updateOverrideItem,
  // File
  getFileStr,
  setFileStr,
  convertMrsRuleset,
  getRuntimeConfig,
  getFilePath,
  readImageFileDataURL,
  // Core
  restartCore,
  getSmartModelStatus,
  downloadSmartModel,
  mihomoHotReloadConfig,
  startMonitor,
  quitWithoutCore,
  // System
  triggerSysProxy,
  checkTunPermissions,
  grantTunPermissions,
  manualGrantCorePermition,
  checkAdminPrivileges,
  restartAsAdmin,
  checkMihomoCorePermissions,
  checkHighPrivilegeCore,
  showTunPermissionDialog,
  showErrorDialog,
  openUWPTool,
  setupFirewall,
  getInterfaces,
  setNativeTheme,
  copyEnv,
  // Update
  getVersion,
  fetchMihomoTags,
  installSpecificMihomoCore,
  clearMihomoVersionCache,
  // Tray
  showTrayIcon,
  closeTrayIcon,
  updateTrayIcon,
  getTrayTrafficStyle,
  // Window
  showMainWindow,
  closeMainWindow,
  triggerMainWindow,
  showFloatingWindow,
  closeFloatingWindow,
  showContextMenu,
  setAlwaysOnTop,
  isAlwaysOnTop,
  openDevTools,
  // Shortcut
  registerShortcut,
  // Misc
  fetchIPInfo,
  measureLatency,
  getImageDataURL,
  relaunchApp,
  quitApp
} = ipc

// platform 需要重命名导出
export const getPlatform = ipc.platform

// 需要特殊处理的函数

// setTitleBarOverlay: 需要静默处理不支持的平台
export async function setTitleBarOverlay(overlay: TitleBarOverlayOptions): Promise<void> {
  try {
    await invoke<void>('setTitleBarOverlay', overlay)
  } catch {
    // Not supported on this platform
  }
}

// updateTrayIconImmediate: 同步调用，不等待结果
export function updateTrayIconImmediate(sysProxyEnabled: boolean, tunEnabled: boolean): void {
  window.electron.ipcRenderer.invoke('updateTrayIconImmediate', sysProxyEnabled, tunEnabled)
}

export function getAppInfo(metadata: IMihomoConnectionDetail['metadata']): Promise<IAppInfo> {
  return invoke<IAppInfo>('getAppInfo', metadata)
}
