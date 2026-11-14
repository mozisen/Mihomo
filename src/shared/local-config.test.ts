import { describe, expect, it } from 'vitest'
import { LOCAL_PROFILE_ID, isLocalProfile } from './local-config'

describe('isLocalProfile', () => {
  it('treats the local editor profile as local', () => {
    expect(isLocalProfile({ id: LOCAL_PROFILE_ID, type: 'local' })).toBe(true)
  })

  it('runs the NEXO account subscription as-is instead of compiling the local template', () => {
    // NEXO 订阅以 type: 'local' 加密存储；若被当成本地配置，运行时只剩 PROXY/DIRECT 模板。
    expect(isLocalProfile({ id: 'nexo', type: 'local', nexo: true })).toBe(false)
  })

  it('ignores remote and the default profile', () => {
    expect(isLocalProfile({ id: 'x', type: 'remote' })).toBe(false)
    expect(isLocalProfile({ id: 'default', type: 'local' })).toBe(false)
    expect(isLocalProfile(undefined)).toBe(false)
  })
})
