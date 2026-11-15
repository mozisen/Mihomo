// nexo 的默认设置：新装与升级都套用一次，之后尊重用户自己的修改。
// v1（1.0.2）：开机自启、静默启动、外部资源每 24 小时自动更新。

export const NEXO_DEFAULTS_VERSION = 1

export interface NexoDefaultsDeps {
  getAppConfig: () => Promise<Pick<IAppConfig, 'nexoDefaultsVersion'>>
  patchAppConfig: (patch: Partial<IAppConfig>) => Promise<void>
  patchControledMihomoConfig: (patch: Partial<IMihomoConfig>) => Promise<void>
  /** 只有安装版才注册开机自启（开发环境会把 electron 本身注册进去） */
  isPackaged: boolean
  checkAutoRun: () => Promise<boolean>
  enableAutoRun: () => Promise<void>
  log?: { warn: (msg: string, e?: unknown) => void }
}

export async function applyNexoDefaults(deps: NexoDefaultsDeps): Promise<boolean> {
  const { nexoDefaultsVersion = 0 } = await deps.getAppConfig()
  if (nexoDefaultsVersion >= NEXO_DEFAULTS_VERSION) return false
  await deps.patchControledMihomoConfig({ 'geo-auto-update': true, 'geo-update-interval': 24 })
  if (deps.isPackaged) {
    try {
      if (!(await deps.checkAutoRun())) await deps.enableAutoRun()
    } catch (e) {
      // 开机自启失败不影响使用，用户仍可在设置里手动打开
      deps.log?.warn('Failed to enable auto start by default', e)
    }
  }
  await deps.patchAppConfig({ silentStart: true, nexoDefaultsVersion: NEXO_DEFAULTS_VERSION })
  return true
}
