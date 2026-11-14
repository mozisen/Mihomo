import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SiderConfig from './sider-config'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/hooks/use-app-config', () => ({
  useAppConfig: () => ({ appConfig: {}, patchAppConfig: vi.fn() })
}))
vi.mock('@renderer/components/base/base-setting-card', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))
vi.mock('@renderer/components/base/base-setting-item', () => ({
  default: ({ title }: { title: string }) => <div data-title={title} />
}))
vi.mock('@heroui/react', () => ({
  RadioGroup: () => null,
  Radio: () => null
}))

describe('SiderConfig', () => {
  it('does not offer size settings for hidden sider cards', () => {
    const html = renderToStaticMarkup(<SiderConfig />)
    for (const key of ['override', 'dns', 'sniff', 'substore']) {
      expect(html).not.toContain(`data-title="sider.cards.${key}"`)
    }
    expect(html).toContain('data-title="sider.cards.proxies"')
    expect(html).toContain('data-title="sider.cards.profiles"')
  })
})
