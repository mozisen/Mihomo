import { describe, expect, it } from 'vitest'
import { resolveOverlayColors } from './titlebar'

const dark = { backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(236, 237, 238)' }
const clear = { backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)' }

describe('resolveOverlayColors', () => {
  it('uses the page background and text colour', () => {
    expect(resolveOverlayColors(dark, undefined, true)).toEqual({
      color: 'rgb(0, 0, 0)',
      symbolColor: 'rgb(236, 237, 238)'
    })
  })

  it('falls back to the body when html is transparent', () => {
    expect(resolveOverlayColors(clear, dark, true).color).toBe('rgb(0, 0, 0)')
  })

  it('never returns a transparent (rendered white) overlay', () => {
    expect(resolveOverlayColors(clear, clear, true)).toEqual({
      color: '#000000',
      symbolColor: '#ffffff'
    })
    expect(
      resolveOverlayColors({ ...clear, backgroundColor: 'transparent' }, clear, false)
    ).toEqual({ color: '#ffffff', symbolColor: '#000000' })
  })
})
