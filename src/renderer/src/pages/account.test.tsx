import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Account, { validateLoginForm } from './account'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/components/base/nexo-logo', () => ({ default: () => <img alt="NEXO" /> }))
vi.mock('@renderer/components/base/base-page', () => ({
  default: (props: { title?: React.ReactNode; children?: React.ReactNode }) => (
    <section>
      <h1>{props.title}</h1>
      {props.children}
    </section>
  )
}))

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
})

describe('Account page', () => {
  it('renders the sign-in form', () => {
    const html = renderToStaticMarkup(<Account />)
    expect(html).toContain('account.title')
    expect(html).toContain('account.login.title')
    expect(html).toContain('name="username"')
    expect(html).toMatch(/name="password"[^>]*type="password"|type="password"[^>]*name="password"/)
    expect(html).toContain('type="submit"')
    expect(html).toContain('account.login.submit')
  })

  it('has every account translation in every locale', () => {
    const dir = join(__dirname, '..', 'locales')
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    const reference = JSON.parse(readFileSync(join(dir, 'zh-CN.json'), 'utf-8'))
    const keys = Object.keys(reference).filter(
      (k) =>
        k.startsWith('account.') || k === 'sider.cards.account' || k.startsWith('guide.account.')
    )
    expect(keys.length).toBeGreaterThan(10)
    for (const file of files) {
      const locale = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      for (const key of keys) expect(locale[key], `${file}: ${key}`).toBeTruthy()
    }
  })
})
