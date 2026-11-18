import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginGate, { isGateOpen } from '@renderer/components/nexo/login-gate'
import { normalizeTwoFactorCode } from '@renderer/components/nexo/login-panel'
import type { NexoAccountState } from '../../../shared/nexo'
import Account, { validateLoginForm } from './account'

const account: { state: NexoAccountState } = { state: { status: 'loggedOut' } }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`
  })
}))
vi.mock('@renderer/components/base/nexo-logo', () => ({ default: () => <img alt="NEXO" /> }))
vi.mock('@renderer/components/base/base-page', () => ({
  default: (props: { title?: React.ReactNode; children?: React.ReactNode }) => (
    <section>
      <h1>{props.title}</h1>
      {props.children}
    </section>
  )
}))
vi.mock('@renderer/hooks/use-nexo-account', () => ({
  useNexoAccount: () => ({ state: account.state, mutate: vi.fn() })
}))
vi.mock('@renderer/utils/ipc', () => ({
  nexoLogin: vi.fn(),
  nexoLogin2fa: vi.fn(),
  nexoCancel2fa: vi.fn(),
  nexoLogout: vi.fn(),
  nexoRefresh: vi.fn(),
  nexoRefreshOnline: vi.fn(),
  nexoSiteLatency: vi.fn(),
  nexoExitIpInfo: vi.fn(async () => new Promise(() => {}))
}))

const GB = 1024 ** 3

beforeEach(() => {
  account.state = { status: 'loggedOut' }
})

describe('validateLoginForm', () => {
  it('requires both account and password', () => {
    expect(validateLoginForm({ username: '', password: '' })).toEqual({
      username: 'account.validation.usernameRequired',
      password: 'account.validation.passwordRequired'
    })
  })

  it('treats a whitespace-only account as empty', () => {
    expect(validateLoginForm({ username: '   ', password: 'x' })).toEqual({
      username: 'account.validation.usernameRequired'
    })
  })

  it('accepts a filled form', () => {
    expect(validateLoginForm({ username: 'user@example.com', password: 'secret' })).toEqual({})
  })

  it('strips spaces from two-factor codes', () => {
    expect(normalizeTwoFactorCode(' 123 456 ')).toBe('123456')
  })
})

describe('Account page', () => {
  it('renders the sign-in form when logged out', () => {
    const html = renderToStaticMarkup(<Account />)
    expect(html).toContain('account.title')
    expect(html).toContain('account.login.title')
    expect(html).toContain('name="username"')
    expect(html).toMatch(/name="password"[^>]*type="password"|type="password"[^>]*name="password"/)
    expect(html).toContain('type="submit"')
    expect(html).toContain('account.login.submit')
  })

  it('shows why the session ended', () => {
    account.state = { status: 'loggedOut', error: 'SESSION_EXPIRED' }
    expect(renderToStaticMarkup(<Account />)).toContain('account.error.SESSION_EXPIRED')
  })

  it('asks for the two-factor code', () => {
    account.state = { status: 'needs2fa' }
    const html = renderToStaticMarkup(<Account />)
    expect(html).toContain('account.twoFactor.title')
    expect(html).toContain('name="code"')
    expect(html).not.toContain('name="password"')
  })

  it('shows account details, traffic and the update button when logged in', () => {
    account.state = {
      status: 'loggedIn',
      syncing: false,
      account: {
        username: 'alice',
        nickname: 'Alice',
        email: 'alice@example.com',
        subscriptionName: '月付套餐',
        trafficUsed: 30 * GB,
        trafficTotal: 100 * GB,
        expire: Date.UTC(2027, 0, 1, 12) / 1000,
        lastSync: Date.UTC(2026, 10, 14, 4)
      }
    }
    const html = renderToStaticMarkup(<Account />)
    expect(html).toContain('Alice')
    expect(html).toContain('alice@example.com')
    expect(html).toContain('月付套餐')
    expect(html).toMatch(/data-testid="traffic-used".*30\.00 GB/)
    expect(html).toMatch(/data-testid="traffic-remaining".*70\.00 GB/)
    expect(html).toMatch(/data-testid="info-expire".*2027-01-01/)
    // 主控暂未提供的数据显示占位
    expect(html).toMatch(/data-testid="info-reset".*account\.info\.unavailable/)
    expect(html).toMatch(/data-testid="info-ip".*account\.info\.unavailable/)
    expect(html).toContain('account.action.updateConfig')
    expect(html).toContain('account.action.logout')
    expect(html).not.toContain('name="password"')
  })

  it('shows the online IP count and connection count on two lines', () => {
    account.state = {
      status: 'loggedIn',
      syncing: false,
      account: { username: 'alice', online: { ips: 1, conns: 16 } }
    }
    const html = renderToStaticMarkup(<Account />)
    expect(html).toMatch(/data-testid="online-ips">account\.info\.onlineIps:1</)
    expect(html).toMatch(/data-testid="online-conns">account\.info\.onlineConns:16</)
    expect(html).not.toContain('1.2.3.4')
  })

  it('shows the site test and exit IP cards below the actions', () => {
    account.state = { status: 'loggedIn', syncing: false, account: { username: 'alice' } }
    const html = renderToStaticMarkup(<Account />)
    expect(html.indexOf('data-testid="site-latency-card"')).toBeGreaterThan(
      html.indexOf('account.action.updateConfig')
    )
    expect(html).toContain('data-testid="exit-ip-card"')
  })

  it('shows progress while the config is updating and a sync error', () => {
    account.state = {
      status: 'loggedIn',
      syncing: true,
      error: 'offline',
      account: { username: 'alice' }
    }
    const html = renderToStaticMarkup(<Account />)
    expect(html).toContain('account.action.updating')
    expect(html).toContain('account.error.syncFailed')
  })

  it('has every account translation in every locale', () => {
    const dir = join(__dirname, '..', 'locales')
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    const reference = JSON.parse(readFileSync(join(dir, 'zh-CN.json'), 'utf-8'))
    const keys = Object.keys(reference).filter(
      (k) =>
        k.startsWith('account.') || k === 'sider.cards.account' || k.startsWith('guide.account.')
    )
    expect(keys.length).toBeGreaterThan(40)
    for (const file of files) {
      const locale = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      for (const key of keys) expect(locale[key], `${file}: ${key}`).toBeTruthy()
    }
  })

  it('has a message for every error code the main process can send', async () => {
    const { NEXO_ERROR_CODES } = await import('../../../shared/nexo')
    const reference = JSON.parse(
      readFileSync(join(__dirname, '..', 'locales', 'zh-CN.json'), 'utf-8')
    )
    for (const code of [...NEXO_ERROR_CODES, 'SESSION_EXPIRED']) {
      expect(reference[`account.error.${code}`], code).toBeTruthy()
    }
  })
})

describe('LoginGate', () => {
  it('only opens for a logged-in account', () => {
    expect(isGateOpen({ status: 'loading' })).toBe(false)
    expect(isGateOpen({ status: 'loggedOut' })).toBe(false)
    expect(isGateOpen({ status: 'needs2fa' })).toBe(false)
    expect(isGateOpen({ status: 'loggedIn', syncing: false, account: { username: 'a' } })).toBe(
      true
    )
  })

  it('covers the app with the sign-in screen while logged out', () => {
    const html = renderToStaticMarkup(
      <LoginGate>
        <main>app</main>
      </LoginGate>
    )
    expect(html).toContain('<main>app</main>')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('name="username"')
    expect(html).toMatch(/aria-hidden="true"[^>]*inert/)
  })

  it('shows a spinner while the saved login is being restored', () => {
    account.state = { status: 'loading' }
    const html = renderToStaticMarkup(
      <LoginGate>
        <main>app</main>
      </LoginGate>
    )
    expect(html).toContain('role="dialog"')
    expect(html).not.toContain('name="username"')
  })

  it('gets out of the way once logged in', () => {
    account.state = { status: 'loggedIn', syncing: false, account: { username: 'a' } }
    const html = renderToStaticMarkup(
      <LoginGate>
        <main>app</main>
      </LoginGate>
    )
    expect(html).toContain('<main>app</main>')
    expect(html).not.toContain('role="dialog"')
  })
})
