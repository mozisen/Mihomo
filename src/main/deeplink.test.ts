import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findDeepLink, handleDeepLink } from './deeplink'
const notificationShow = vi.fn()
const addProfileItem = vi.fn()
const safeShowErrorBox = vi.fn()

vi.mock('electron', () => ({
  Notification: class {
    show(): void {
      notificationShow()
    }
  }
}))
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('./config', () => ({
  addProfileItem: (...args: unknown[]) => addProfileItem(...args)
}))
vi.mock('./window', () => ({ mainWindow: null }))
vi.mock('./utils/init', () => ({
  safeShowErrorBox: (...args: unknown[]) => safeShowErrorBox(...args)
}))

beforeEach(() => {
  notificationShow.mockReset()
  addProfileItem.mockReset().mockResolvedValue(undefined)
  safeShowErrorBox.mockReset()
})

describe('findDeepLink', () => {
  it('finds a supported scheme anywhere in the command line', () => {
    expect(findDeepLink(['app', '--flag', 'clash://install-config?url=x'])).toBe(
      'clash://install-config?url=x'
    )
    expect(findDeepLink(['app', 'MIHOMO://install-config?url=x'])).toBe(
      'MIHOMO://install-config?url=x'
    )
  })

  it('ignores unrelated arguments', () => {
    expect(findDeepLink(['app', '--flag'])).toBeUndefined()
  })
})

describe('handleDeepLink', () => {
  it('imports a remote config', async () => {
    await handleDeepLink('clash://install-config?url=https%3A%2F%2Fexample.com%2Fsub&name=x')
    expect(addProfileItem).toHaveBeenCalledWith({
      type: 'remote',
      name: 'x',
      url: 'https://example.com/sub'
    })
    expect(notificationShow).toHaveBeenCalledOnce()
  })

  it('ignores the removed install-plugin action', async () => {
    await handleDeepLink('clash://install-plugin?url=https%3A%2F%2Fprovider.example%2Fapp.cpx')
    expect(addProfileItem).not.toHaveBeenCalled()
    expect(safeShowErrorBox).not.toHaveBeenCalled()
  })
})
