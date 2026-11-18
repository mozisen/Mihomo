import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/utils/ipc', () => ({
  nexoGetUpdateState: vi.fn(),
  nexoUpdateRespond: vi.fn(),
  nexoUpdateDismiss: vi.fn()
}))

describe('UpdateModalView', () => {
  it('renders nothing while idle', async () => {
    const { UpdateModalView } = await import('./update-modal')
    expect(
      renderToStaticMarkup(
        <UpdateModalView state={{ phase: 'idle' }} onRespond={vi.fn()} onDismiss={vi.fn()} />
      )
    ).toBe('')
  })
})
