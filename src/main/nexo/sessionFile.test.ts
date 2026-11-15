import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/dirs', () => ({ dataDir: () => '/tmp/nexo-test-data' }))

describe('shouldShowWindowOnStart', () => {
  it('hides the window only for a logged-in silent start', async () => {
    const { shouldShowWindowOnStart: show } = await import('./sessionFile')
    expect(show({ silentStart: true, dev: false, loggedIn: true })).toBe(false)
    expect(show({ silentStart: true, dev: false, loggedIn: false })).toBe(true)
    expect(show({ silentStart: false, dev: false, loggedIn: true })).toBe(true)
    expect(show({ silentStart: true, dev: true, loggedIn: true })).toBe(true)
  })
})
