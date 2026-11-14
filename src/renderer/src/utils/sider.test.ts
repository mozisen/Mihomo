import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDER_ORDER } from '../../../shared/appConfig'
import {
  HIDDEN_SIDER_CARDS,
  SIDER_CARD_KEYS,
  getSiderCardByPath,
  getSiderCardRoute,
  isSiderCardHidden,
  mergeSiderOrder
} from './sider'

const hidden = ['override', 'dns', 'sniff', 'substore'] as const

describe('hidden sider cards', () => {
  it('hides override, DNS override, sniffer override and Sub-Store', () => {
    expect([...HIDDEN_SIDER_CARDS].sort()).toEqual([...hidden].sort())
    for (const key of hidden) {
      expect(isSiderCardHidden(key)).toBe(true)
      expect(SIDER_CARD_KEYS).not.toContain(key)
    }
  })

  it('keeps every other card visible', () => {
    const visible = DEFAULT_SIDER_ORDER.filter((key) => !hidden.includes(key as never))
    expect(SIDER_CARD_KEYS).toEqual(visible)
  })

  it('drops hidden cards from a saved order', () => {
    const order = mergeSiderOrder(['substore', 'proxy', 'dns', 'override', 'sniff', 'log'])
    expect(order.slice(0, 2)).toEqual(['proxy', 'log'])
    for (const key of hidden) expect(order).not.toContain(key)
    expect(order).toHaveLength(SIDER_CARD_KEYS.length)
  })

  it('does not restore or route to a hidden card', () => {
    expect(getSiderCardRoute('override')).toBe('/proxies')
    expect(getSiderCardRoute('substore')).toBe('/proxies')
    expect(getSiderCardByPath('/dns')).toBeUndefined()
    expect(getSiderCardByPath('/sniffer')).toBeUndefined()
    expect(getSiderCardByPath('/proxies')).toBe('proxy')
  })
})
