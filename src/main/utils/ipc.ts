import { app, ipcMain } from 'electron'
import i18next from 'i18next'
import {
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoCloseConnection,
  mihomoGroupDelay,
  mihomoGroups,
  mihomoProxies,
  mihomoProxyDelay,
  mihomoProxyProviders,
  mihomoRuleProviders,
  mihomoRules,
  mihomoUnfixedProxy,
  mihomoUpdateProxyProviders,
  mihomoUpdateRuleProviders,
  mihomoUpgrade,
  mihomoUpgradeGeo,
  mihomoUpgradeUI,
  mihomoHotReloadConfig,
  mihomoVersion,
  patchMihomoConfig,
  mihomoSmartGroupWeights,
  mihomoSmartFlushCache,
  mihomoRulesDisable
} from '../core/mihomoApi'
import { checkAutoRun, disableAutoRun, enableAutoRun } from '../sys/autoRun'
import {
  getAppConfig,
  patchAppConfig,
  getControledMihomoConfig,
  patchControledMihomoConfig,
  getProfileConfig,
  getCurrentProfileItem,
  getProfileItem,
  addProfileItem,
  removeProfileItem,
  changeCurrentProfile,
  getFileStr,
  setFileStr,
  updateProfileItem,
  setProfileConfig,
  getOverrideConfig,
  setOverrideConfig,
  addOverrideItem,
  removeOverrideItem,
  updateOverrideItem,
  convertMrsRuleset
} from '../config'
import {
  quitWithoutCore,
  restartCore,
  checkTunPermissions,
  grantTunPermissions,
  manualGrantCorePermition,
  checkAdminPrivileges,
  restartAsAdmin,
  checkMihomoCorePermissions,
  requestTunPermissions,
  checkHighPrivilegeCore,
  showTunPermissionDialog,
  showErrorDialog
} from '../core/manager'
import { triggerSysProxy } from '../sys/sysproxy'
import {
  getFilePath,
  openUWPTool,
  readImageFileDataURL,
  resetAppConfig,
  setNativeTheme,
  setupFirewall
} from '../sys/misc'
import { getRuntimeConfig } from '../core/factory'
import {
  nexoCancel2fa,
  nexoGetAccountState,
  nexoGuardContext,
  nexoLogin,
  nexoLogin2fa,
  nexoLogout,
  nexoRefresh
} from '../nexo/account'
import { guardNexoHandlers } from '../nexo/ipcGuard'
import {
  localSwitchNeedsDnsConfirm,
  setControlDns,
  takeDnsOverrideAutoDisabledNotice
} from '../core/dnsOverrideGuard'
import { getSmartModelStatus, downloadSmartModel } from '../core/smartModel'
import { getInterfaces } from '../sys/interface'
import {
  closeTrayIcon,
  copyEnv,
  getTrayTrafficStyle,
  showTrayIcon,
  updateTrayIcon,
  updateTrayIconImmediate
} from '../resolve/tray'
import { registerShortcut } from '../resolve/shortcut'
import { closeMainWindow, mainWindow, showMainWindow, triggerMainWindow } from '../window'
import { startMonitor } from '../resolve/trafficMonitor'
import { closeFloatingWindow, showContextMenu, showFloatingWindow } from '../resolve/floatingWindow'
import { addProfileUpdater, removeProfileUpdater } from '../core/profileUpdater'
import {
  clearTrafficUsage,
  importTrafficUsage,
  queryTrafficUsageBreakdown,
  queryTrafficUsageOverview
} from '../traffic/database'
import { getImageDataURL } from './image'
import { get as httpGet } from './chromeRequest'
import { getAppInfo } from './app-info'
import { installMihomoCore, getGitHubTags, clearVersionCache } from './github'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFn = (...args: any[]) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyncFn = (...args: any[]) => any

function wrapAsync<T extends AsyncFn>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T> | { invokeError: unknown }> {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e) {
        return { invokeError: e.message }
      }
      return { invokeError: typeof e === 'string' ? e : 'Unknown Error' }
    }
  }
}

function registerHandlers(handlers: Record<string, AsyncFn | SyncFn>, async = true): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    if (async) {
      ipcMain.handle(channel, (_e, ...args) => wrapAsync(handler as AsyncFn)(...args))
    } else {
      ipcMain.handle(channel, (_e, ...args) => (handler as SyncFn)(...args))
    }
  }
}

async function fetchMihomoTags(
  forceRefresh = false
): Promise<{ name: string; zipball_url: string; tarball_url: string }[]> {
  return await getGitHubTags('MetaCubeX', 'mihomo', forceRefresh)
}

async function installSpecificMihomoCore(version: string): Promise<void> {
  clearVersionCache('MetaCubeX', 'mihomo')
  return await installMihomoCore(version)
}

async function clearMihomoVersionCache(): Promise<void> {
  clearVersionCache('MetaCubeX', 'mihomo')
}

async function fetchIPInfo(url: string): Promise<unknown> {
  const res = await httpGet<unknown>(url, { timeout: 10000, responseType: 'json' })
  return res.data
}

async function measureLatency(url: string): Promise<number | null> {
  try {
    const t0 = Date.now()
    await httpGet<unknown>(url, { timeout: 5000, responseType: 'text' })
    return Date.now() - t0
  } catch {
    return null
  }
}

async function changeLanguage(lng: string): Promise<void> {
  await i18next.changeLanguage(lng)
  ipcMain.emit('updateTrayMenu')
}

async function setTitleBarOverlay(overlay: Electron.TitleBarOverlayOptions): Promise<void> {
  if (mainWindow && typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay(overlay)
  }
}

const rawAsyncHandlers: Record<string, AsyncFn> = {
  // NEXO account
  nexoGetAccountState,
  nexoLogin,
  nexoLogin2fa,
  nexoCancel2fa,
  nexoLogout,
  nexoRefresh,
  // Mihomo API
  mihomoVersion,
  mihomoCloseConnection,
  mihomoCloseAllConnections,
  mihomoRules,
  mihomoRulesDisable,
  queryTrafficUsageOverview,
  queryTrafficUsageBreakdown,
  importTrafficUsage,
  clearTrafficUsage,
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
  // AutoRun
  checkAutoRun,
  enableAutoRun,
  disableAutoRun,
  // Config
  getAppConfig,
  patchAppConfig,
  getControledMihomoConfig,
  patchControledMihomoConfig,
  setControlDns,
  takeDnsOverrideAutoDisabledNotice,
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
  requestTunPermissions,
  checkHighPrivilegeCore,
  showTunPermissionDialog,
  showErrorDialog,
  openUWPTool,
  setupFirewall,
  copyEnv,
  // Update
  fetchMihomoTags,
  installSpecificMihomoCore,
  clearMihomoVersionCache,
  // Tray
  showTrayIcon,
  closeTrayIcon,
  updateTrayIcon,
  getTrayTrafficStyle,
  // Floating Window
  showFloatingWindow,
  closeFloatingWindow,
  showContextMenu,
  // Misc
  fetchIPInfo,
  measureLatency,
  getImageDataURL,
  readImageFileDataURL,
  getAppInfo,
  changeLanguage,
  setTitleBarOverlay,
  registerShortcut
}

// NEXO 账户订阅受保护：渲染进程与 MCP 都不能读出或改写它的内容
const asyncHandlers = guardNexoHandlers(rawAsyncHandlers, nexoGuardContext)

const syncHandlers: Record<string, SyncFn> = {
  resetAppConfig,
  getFilePath,
  getInterfaces,
  setNativeTheme,
  getVersion: () => app.getVersion(),
  platform: () => process.platform,
  updateTrayIconImmediate,
  showMainWindow,
  closeMainWindow,
  triggerMainWindow,
  setAlwaysOnTop: (alwaysOnTop: boolean) => mainWindow?.setAlwaysOnTop(alwaysOnTop),
  isAlwaysOnTop: () => mainWindow?.isAlwaysOnTop(),
  openDevTools: () => mainWindow?.webContents.openDevTools(),
  relaunchApp: () => {
    app.relaunch()
    app.quit()
  },
  quitApp: () => app.quit()
}

export function registerIpcMainHandlers(): void {
  registerHandlers(asyncHandlers, true)
  registerHandlers(syncHandlers, false)
}
