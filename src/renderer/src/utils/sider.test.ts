import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDER_ORDER } from '../../../shared/appConfig'
import { SIDER_CARD_KEYS, getSiderCardByPath, getSiderCardRoute } from './sider'

describe('sider cards', () => {
  it('uses a fixed order with resources at the bottom, right of usage', () => {
    expect(SIDER_CARD_KEYS).toEqual(DEFAULT_SIDER_ORDER)
    expect(SIDER_CARD_KEYS.slice(-2)).toEqual(['usage', 'resource'])
  })

  it('no longer has override, DNS or sniffer cards', () => {
    for (const key of ['override', 'dns', 'sniff']) {
      expect(SIDER_CARD_KEYS).not.toContain(key)
    }
  })

  it('does not route to removed pages', () => {
    expect(getSiderCardRoute('override')).toBe('/proxies')
    expect(getSiderCardRoute('substore')).toBe('/proxies')
    expect(getSiderCardByPath('/dns')).toBeUndefined()
    expect(getSiderCardByPath('/sniffer')).toBeUndefined()
    expect(getSiderCardByPath('/proxies')).toBe('proxy')
  })

  it('routes the profile slot to the account page', () => {
    expect(getSiderCardRoute('profile')).toBe('/account')
    expect(getSiderCardByPath('/account')).toBe('profile')
    expect(getSiderCardByPath('/profiles')).toBeUndefined()
  })
})

describe('sider layout', () => {
  it('places usage bottom-left and resources bottom-right in the 2-column grid', async () => {
    const { SIDER_CARD_DEFAULT_STATUS } = await import('../../../shared/appConfig')
    const statusKey: Record<SiderCardKey, keyof typeof SIDER_CARD_DEFAULT_STATUS> = {
      sysproxy: 'sysproxyCardStatus',
      tun: 'tunCardStatus',
      profile: 'profileCardStatus',
      proxy: 'proxyCardStatus',
      rule: 'ruleCardStatus',
      connection: 'connectionCardStatus',
      mihomo: 'mihomoCoreCardStatus',
      log: 'logCardStatus',
      network: 'networkCardStatus',
      usage: 'usageCardStatus',
      resource: 'resourceCardStatus'
    }
    // Simulate CSS grid auto-placement for a 2-column grid without dense packing.
    const cells: Record<string, { row: number; col: number }> = {}
    let row = 0
    let col = 0
    for (const key of SIDER_CARD_KEYS) {
      const span = SIDER_CARD_DEFAULT_STATUS[statusKey[key]] === 'col-span-2' ? 2 : 1
      if (col + span > 2) {
        row++
        col = 0
      }
      cells[key] = { row, col }
      col += span
      if (col >= 2) {
        row++
        col = 0
      }
    }
    const lastRow = Math.max(...Object.values(cells).map((c) => c.row))
    expect(cells.usage).toEqual({ row: lastRow, col: 0 })
    expect(cells.resource).toEqual({ row: lastRow, col: 1 })
  })
})
