import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildElevatedTaskXml,
  ELEVATED_FLAG,
  ELEVATED_MARKER,
  readTaskExe,
  shouldRelaunchElevated,
  type RelaunchInput
} from './elevatedLaunch'

const exe = 'C:\\Program Files\\nexo\\nexo.exe'
const base: RelaunchInput = {
  platform: 'win32',
  packaged: true,
  elevated: null,
  argv: [exe],
  exe,
  taskExe: exe
}

describe('shouldRelaunchElevated', () => {
  it('hands a normal launch to the elevated task once it is registered', () => {
    expect(shouldRelaunchElevated(base)).toBe(true)
    // 路径大小写不同视为同一个 exe
    expect(shouldRelaunchElevated({ ...base, taskExe: exe.toLowerCase() })).toBe(true)
  })

  it('never loops: an already elevated or task-started process stays', () => {
    expect(shouldRelaunchElevated({ ...base, elevated: true })).toBe(false)
    expect(shouldRelaunchElevated({ ...base, argv: [exe, ELEVATED_FLAG] })).toBe(false)
  })

  it('keeps launches it cannot reproduce', () => {
    expect(shouldRelaunchElevated({ ...base, argv: [exe, 'clash://install-config?url=x'] })).toBe(
      false
    )
    expect(shouldRelaunchElevated({ ...base, taskExe: undefined })).toBe(false)
    expect(shouldRelaunchElevated({ ...base, taskExe: 'D:\\old\\nexo.exe' })).toBe(false)
    expect(shouldRelaunchElevated({ ...base, packaged: false })).toBe(false)
    expect(shouldRelaunchElevated({ ...base, platform: 'darwin' })).toBe(false)
  })
})

describe('buildElevatedTaskXml', () => {
  it('runs with highest privileges, on demand only, with the loop guard flag', () => {
    const xml = buildElevatedTaskXml('C:\\A&B\\nexo.exe')
    expect(xml).toContain('<RunLevel>HighestAvailable</RunLevel>')
    expect(xml).toContain('<Triggers />')
    expect(xml).toContain('<AllowStartOnDemand>true</AllowStartOnDemand>')
    expect(xml).toContain('<Command>"C:\\A&amp;B\\nexo.exe"</Command>')
    expect(xml).toContain(`<Arguments>${ELEVATED_FLAG}</Arguments>`)
  })
})

describe('readTaskExe', () => {
  it('reads the marker and tolerates a missing or broken file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'nexo-elev-'))
    expect(readTaskExe(dir)).toBeUndefined()
    writeFileSync(path.join(dir, ELEVATED_MARKER), '{oops')
    expect(readTaskExe(dir)).toBeUndefined()
    writeFileSync(path.join(dir, ELEVATED_MARKER), JSON.stringify({ exe }))
    expect(readTaskExe(dir)).toBe(exe)
  })
})
