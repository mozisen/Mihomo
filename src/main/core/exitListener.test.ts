import { describe, expect, it } from 'vitest'
import { EXIT_LISTENER_NAME, injectExitListener, pickExitGroup } from './exitListener'

const g = (name: string, type = 'select') => ({ name, type, proxies: ['DIRECT'] })

describe('pickExitGroup', () => {
  it('prefers the 节点选择 group', () => {
    expect(
      pickExitGroup({ 'proxy-groups': [g('自动选择', 'url-test'), g('其他'), g('🚀 节点选择')] })
    ).toBe('🚀 节点选择')
  })

  it('falls back to a proxy-like select group, then the first select group', () => {
    expect(pickExitGroup({ 'proxy-groups': [g('Auto', 'url-test'), g('Media'), g('Proxy')] })).toBe(
      'Proxy'
    )
    expect(pickExitGroup({ 'proxy-groups': [g('Auto', 'url-test'), g('Media')] })).toBe('Media')
    expect(pickExitGroup({ 'proxy-groups': [g('Auto', 'url-test')] })).toBeUndefined()
    expect(pickExitGroup({})).toBeUndefined()
  })
})

describe('injectExitListener', () => {
  it('adds a localhost mixed listener bound to the group, keeping other listeners', () => {
    const profile: Record<string, unknown> = {
      'proxy-groups': [g('节点选择')],
      listeners: [{ name: 'user', type: 'socks', port: 1080 }, { name: EXIT_LISTENER_NAME }]
    }
    expect(injectExitListener(profile, 23456)).toBe('节点选择')
    expect(profile.listeners).toEqual([
      { name: 'user', type: 'socks', port: 1080 },
      {
        name: EXIT_LISTENER_NAME,
        type: 'mixed',
        port: 23456,
        listen: '127.0.0.1',
        proxy: '节点选择'
      }
    ])
  })

  it('does nothing without a select group or port', () => {
    const profile: Record<string, unknown> = { 'proxy-groups': [] }
    expect(injectExitListener(profile, 23456)).toBeUndefined()
    expect(profile.listeners).toBeUndefined()
    expect(injectExitListener({ 'proxy-groups': [g('节点选择')] }, 0)).toBeUndefined()
  })
})
