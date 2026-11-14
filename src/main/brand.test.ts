import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { parse } from 'yaml'

const root = join(__dirname, '..', '..')
const readText = (...p: string[]): string => readFileSync(join(root, ...p), 'utf-8')

describe('NEXO branding', () => {
  it('uses NEXO identity in package metadata', () => {
    const pkg = JSON.parse(readText('package.json'))
    expect(pkg.name).toBe('nexo')
    expect(pkg.description).toBe('NEXO')
    expect(pkg.version).toBe('1.0.0')
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
  it('ships without an updater that could pull upstream releases', () => {
    expect(existsSync(join(root, 'src', 'main', 'resolve', 'autoUpdater.ts'))).toBe(false)
    expect(readText('src', 'preload', 'index.ts')).not.toMatch(
      /checkUpdate|downloadAndInstallUpdate/
    )
  })
})

describe('slim bundle', () => {
  it('does not download the removed resources at build time', () => {
    const prepare = readText('scripts', 'prepare.mjs')
    for (const file of ['ASN.mmdb', 'BundleMRS.7z', 'geoip.metadb', '7za.exe', 'sub-store']) {
      expect(prepare, file).not.toContain(file)
    }
  })

  it('does not register the .cpx plugin file type', () => {
    expect(parse(readText('electron-builder.yml')).fileAssociations).toBeUndefined()
  })

  it('does not bundle the Monaco editor', () => {
    const pkg = JSON.parse(readText('package.json'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of ['react-monaco-editor', 'monaco-yaml', 'vite-plugin-monaco-editor']) {
      expect(deps[name], name).toBeUndefined()
    }
  })
})
