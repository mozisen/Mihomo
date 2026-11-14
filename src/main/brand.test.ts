import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, vi } from 'vitest'
import { parse } from 'yaml'

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '2.0.4', getPath: () => '/tmp' },
  shell: {}
}))
vi.mock('./window', () => ({ mainWindow: null }))
vi.mock('./utils/logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./utils/dirs', () => ({
  dataDir: () => '/tmp',
  exeDir: () => '/tmp',
  exePath: () => '/tmp/NEXO',
  isPortable: () => false,
  resourcesFilesDir: () => '/tmp'
}))
vi.mock('./config', () => ({
  getAppConfig: async () => ({}),
  getControledMihomoConfig: async () => ({})
}))
vi.mock('./core/manager', () => ({ checkAdminPrivileges: vi.fn() }))
vi.mock('./utils/chromeRequest', () => ({ get: mocks.get }))

const root = join(__dirname, '..', '..')
const readText = (...p: string[]): string => readFileSync(join(root, ...p), 'utf-8')

describe('NEXO branding', () => {
  it('uses NEXO identity in package metadata', () => {
    const pkg = JSON.parse(readText('package.json'))
    expect(pkg.name).toBe('nexo')
    expect(pkg.description).toBe('NEXO')
  })

  it('packages the app as NEXO with nexo-* artifacts', () => {
    const config = parse(readText('electron-builder.yml'))
    expect(config.productName).toBe('NEXO')
    expect(config.appId).toBe('com.nexo.app')

    const artifactNames = [
      config.win.artifactName,
      config.nsis.artifactName,
      config.mac.artifactName,
      config.linux.artifactName,
      config.pacman.artifactName
    ]
    for (const name of artifactNames) {
      expect(name).toMatch(/^nexo-/)
    }
  })

  it('has no leftover Clash Party wording in UI translations', () => {
    const localesDir = join(root, 'src', 'renderer', 'src', 'locales')
    for (const file of readdirSync(localesDir).filter((f) => f.endsWith('.json'))) {
      const text = readFileSync(join(localesDir, file), 'utf-8')
      expect(text, file).not.toMatch(/Clash Party|Mihomo Party/)
    }
  })

  it('shows NEXO as the window title', () => {
    expect(readText('src', 'renderer', 'index.html')).toContain('<title>NEXO</title>')
  })
})

describe('auto update', () => {
  it('never checks the upstream release feed', async () => {
    const { checkUpdate, APP_UPDATE_ENABLED } = await import('./resolve/autoUpdater')
    expect(APP_UPDATE_ENABLED).toBe(false)
    await expect(checkUpdate()).resolves.toBeUndefined()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
