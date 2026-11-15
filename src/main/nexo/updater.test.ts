import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  UPDATE_MANIFEST_URL,
  Updater,
  compareVersions,
  pickUpdate,
  type UpdateManifest,
  type UpdaterDeps
} from './updater'

const installer = Buffer.from('fake installer bytes '.repeat(1000))
const sha = createHash('sha256').update(installer).digest('hex')
const file = 'nexo-windows-1.0.2-x64-setup.exe'

const manifest = (over: Partial<UpdateManifest> = {}): UpdateManifest => ({
  version: '1.0.2',
  notes: '修复问题',
  assets: { win32: { x64: { file, sha256: sha, size: installer.length } } },
  ...over
})

function setup(
  opts: { manifest?: unknown; status?: number; body?: Buffer; confirm?: boolean } = {}
) {
  const calls: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url)
    if (url === UPDATE_MANIFEST_URL) {
      return new Response(JSON.stringify(opts.manifest ?? manifest()), {
        status: opts.status ?? 200
      })
    }
    return new Response(new Uint8Array(opts.body ?? installer), { status: 200 })
  })
  const deps = {
    currentVersion: '1.0.1',
    platform: 'win32',
    arch: 'x64',
    downloadDir: mkdtempSync(path.join(tmpdir(), 'nexo-update-')),
    fetch: fetchImpl,
    confirm: vi.fn(async () => opts.confirm ?? true),
    launch: vi.fn(async () => ''),
    quit: vi.fn(),
    reportError: vi.fn(),
    onProgress: vi.fn()
  } satisfies UpdaterDeps
  return { updater: new Updater(deps), deps, calls }
}

describe('compareVersions', () => {
  it('compares numerically', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
  })
})

describe('pickUpdate', () => {
  it('returns the installer for this platform when newer', () => {
    expect(pickUpdate(manifest(), '1.0.1', 'win32', 'x64')).toEqual({
      version: '1.0.2',
      notes: '修复问题',
      url: `https://echo.voee.de/nexo/${file}`,
      file,
      sha256: sha,
      size: installer.length
    })
  })

  it('ignores same or older versions and other platforms', () => {
    expect(pickUpdate(manifest(), '1.0.2', 'win32', 'x64')).toBeUndefined()
    expect(pickUpdate(manifest(), '1.1.0', 'win32', 'x64')).toBeUndefined()
    expect(pickUpdate(manifest(), '1.0.1', 'darwin', 'arm64')).toBeUndefined()
  })

  it('only downloads plain file names from the update site', () => {
    for (const bad of ['../evil.exe', 'https://evil.example/x.exe', '/abs.exe', '.hidden']) {
      const m = manifest({ assets: { win32: { x64: { file: bad, sha256: sha } } } })
      expect(pickUpdate(m, '1.0.1', 'win32', 'x64'), bad).toBeUndefined()
    }
    const noHash = manifest({ assets: { win32: { x64: { file, sha256: 'abc' } } } })
    expect(pickUpdate(noHash, '1.0.1', 'win32', 'x64')).toBeUndefined()
    expect(pickUpdate({ version: 'latest' } as UpdateManifest, '1.0.1', 'win32', 'x64')).toBe(
      undefined
    )
  })
})

describe('Updater', () => {
  it('downloads, verifies, launches the installer and quits after confirmation', async () => {
    const { updater, deps, calls } = setup()
    await updater.checkOnce()
    expect(calls).toEqual([UPDATE_MANIFEST_URL, `https://echo.voee.de/nexo/${file}`])
    const target = path.join(deps.downloadDir, file)
    expect(readFileSync(target)).toEqual(installer)
    expect(deps.launch).toHaveBeenCalledWith(target)
    expect(deps.quit).toHaveBeenCalled()
    expect(deps.onProgress).toHaveBeenLastCalledWith(-1)
  })

  it('checks only once per launch', async () => {
    const { updater, calls } = setup({ confirm: false })
    await updater.checkOnce()
    await updater.checkOnce()
    expect(calls).toEqual([UPDATE_MANIFEST_URL])
  })

  it('does nothing when the user postpones', async () => {
    const { updater, deps } = setup({ confirm: false })
    await updater.checkOnce()
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('rejects a tampered installer and keeps running', async () => {
    const { updater, deps } = setup({ body: Buffer.from('tampered') })
    await updater.checkOnce()
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.reportError).toHaveBeenCalled()
    expect(existsSync(path.join(deps.downloadDir, file))).toBe(false)
  })

  it('stays quiet when there is no manifest or the site is down', async () => {
    for (const status of [404, 502]) {
      const { updater, deps } = setup({ status })
      await expect(updater.checkOnce()).resolves.toBeUndefined()
      expect(deps.confirm).not.toHaveBeenCalled()
      expect(deps.reportError).not.toHaveBeenCalled()
    }
  })

  it('does not quit when the installer cannot be opened', async () => {
    const { updater, deps } = setup()
    deps.launch.mockResolvedValueOnce('access denied')
    await updater.checkOnce()
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.reportError).toHaveBeenCalledWith('access denied')
  })

  it('reports the result of a manual check and allows checking again', async () => {
    const up = setup({ manifest: manifest({ version: '1.0.1' }) })
    await expect(up.updater.checkManually()).resolves.toEqual({
      status: 'upToDate',
      version: '1.0.1'
    })
    await expect(up.updater.checkManually()).resolves.toMatchObject({ status: 'upToDate' })
    // 手动检查过就不再自动检查
    await up.updater.checkOnce()
    expect(up.calls).toHaveLength(2)

    const down = setup({ status: 502 })
    await expect(down.updater.checkManually()).resolves.toMatchObject({ status: 'error' })

    const later = setup({ confirm: false })
    await expect(later.updater.checkManually()).resolves.toEqual({
      status: 'available',
      version: '1.0.2'
    })
  })
})
