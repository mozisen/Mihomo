import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Settings from './settings'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/components/base/base-page', () => ({
  default: (props: {
    title?: React.ReactNode
    header?: React.ReactNode
    children?: React.ReactNode
  }) => (
    <section>
      <header data-testid="page-header">{props.header}</header>
      {props.children}
    </section>
  )
}))
vi.mock('@renderer/components/settings/webdav-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/general-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/mihomo-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/actions', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/shortcut-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/sider-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/substore-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/local-backup-config', () => ({ default: () => null }))
vi.mock('@renderer/components/settings/mcp-config', () => ({ default: () => null }))

describe('Settings page', () => {
  it('has no docs, GitHub or Telegram link buttons in the header', () => {
    const html = renderToStaticMarkup(<Settings />)
    expect(html).toContain('<header data-testid="page-header"></header>')
    expect(html).not.toMatch(/settings\.links\.|<button/)
  })
})
