import { describe, expect, it, vi } from 'vitest'
import { NEXO_DEFAULTS_VERSION, applyNexoDefaults, type NexoDefaultsDeps } from './nexoDefaults'

function deps(over: Partial<NexoDefaultsDeps> = {}) {
  return {
    getAppConfig: vi.fn(async () => ({})),
    patchAppConfig: vi.fn(async () => {}),
    patchControledMihomoConfig: vi.fn(async () => {}),
    isPackaged: true,
    checkAutoRun: vi.fn(async () => false),
    enableAutoRun: vi.fn(async () => {}),
    ...over
  }
}

describe('applyNexoDefaults', () => {
  it('turns on auto start, silent start and 24h resource updates once', async () => {
    const d = deps()
    await expect(applyNexoDefaults(d)).resolves.toBe(true)
    expect(d.enableAutoRun).toHaveBeenCalled()
    expect(d.patchAppConfig).toHaveBeenCalledWith({
      silentStart: true,
      nexoDefaultsVersion: NEXO_DEFAULTS_VERSION
    })
    expect(d.patchControledMihomoConfig).toHaveBeenCalledWith({
      'geo-auto-update': true,
      'geo-update-interval': 24
    })
  })

  it('keeps the user choices after the defaults were applied', async () => {
    const d = deps({ getAppConfig: vi.fn(async () => ({ nexoDefaultsVersion: 1 })) })
    await expect(applyNexoDefaults(d)).resolves.toBe(false)
    expect(d.patchAppConfig).not.toHaveBeenCalled()
    expect(d.enableAutoRun).not.toHaveBeenCalled()
  })

  it('does not register the dev build or re-register an existing entry', async () => {
    const dev = deps({ isPackaged: false })
    await applyNexoDefaults(dev)
    expect(dev.checkAutoRun).not.toHaveBeenCalled()
    expect(dev.enableAutoRun).not.toHaveBeenCalled()
    const on = deps({ checkAutoRun: vi.fn(async () => true) })
    await applyNexoDefaults(on)
    expect(on.enableAutoRun).not.toHaveBeenCalled()
  })

  it('still applies the other defaults when auto start fails', async () => {
    const d = deps({ enableAutoRun: vi.fn(async () => Promise.reject(new Error('denied'))) })
    await applyNexoDefaults(d)
    expect(d.patchAppConfig).toHaveBeenCalled()
  })
})

describe('startup order (regression: 1.0.2 blank window)', () => {
  it('never applies the defaults during initBasic, before the core is running', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const init = readFileSync(join(__dirname, 'init.ts'), 'utf-8')
    const migration = init.slice(init.indexOf('async function migration()'))
    const body = migration.slice(0, migration.indexOf('\n}\n'))
    expect(body).not.toMatch(/NexoDefaults/)
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8')
    // 只在内核启动成功后的回调里调用
    expect(index.indexOf('applyNexoDefaultsAfterCoreStart()')).toBeGreaterThan(
      index.indexOf('startCoreForStartup()')
    )
  })
})
