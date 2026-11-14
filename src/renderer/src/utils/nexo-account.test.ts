import { describe, expect, it } from 'vitest'
import { buildAccountView, nextResetDate } from './nexo-account'

const GB = 1024 ** 3

describe('buildAccountView', () => {
  it('computes used, remaining and percent', () => {
    const view = buildAccountView({
      username: 'alice',
      nickname: 'Alice',
      trafficUsed: 25 * GB,
      trafficTotal: 100 * GB,
      expire: Date.UTC(2027, 0, 1, 12) / 1000
    })
    expect(view).toMatchObject({
      displayName: 'Alice',
      used: '25.00 GB',
      remaining: '75.00 GB',
      total: '100.0 GB',
      percent: 25,
      unlimited: false,
      expire: '2027-01-01'
    })
  })

  it('never shows negative remaining traffic', () => {
    const view = buildAccountView({ username: 'a', trafficUsed: 120, trafficTotal: 100 })
    expect(view.remaining).toBe('0.00 B')
    expect(view.percent).toBe(100)
  })

  it('treats a zero quota as unlimited', () => {
    const view = buildAccountView({ username: 'a', trafficUsed: 5, trafficTotal: 0 })
    expect(view.unlimited).toBe(true)
    expect(view.remaining).toBeUndefined()
  })

  it('leaves unknown fields empty', () => {
    const view = buildAccountView({ username: 'bob' })
    expect(view).toEqual({ displayName: 'bob', unlimited: false })
  })

  it('formats online IPs and the next reset date', () => {
    const view = buildAccountView(
      { username: 'a', resetDay: 15, onlineIps: ['1.1.1.1', '2.2.2.2'] },
      new Date(2026, 10, 14)
    )
    expect(view.onlineIps).toBe('1.1.1.1, 2.2.2.2')
    expect(view.reset).toBe('2026-11-15')
  })
})

describe('nextResetDate', () => {
  it('moves to next month once the day has passed', () => {
    expect(nextResetDate(1, new Date(2026, 10, 14)).getMonth()).toBe(11)
    expect(nextResetDate(14, new Date(2026, 10, 14)).getMonth()).toBe(11)
  })

  it('clamps to the last day of short months', () => {
    expect(nextResetDate(31, new Date(2027, 1, 3)).getDate()).toBe(28)
  })
})
