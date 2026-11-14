import { describe, expect, it } from 'vitest'
import { nexoErrorCode } from './nexo'

describe('nexoErrorCode', () => {
  it('extracts the code from an IPC error message', () => {
    expect(
      nexoErrorCode(new Error("Error invoking remote method 'nexoLogin': NEXO:INVALID_CREDENTIALS"))
    ).toBe('INVALID_CREDENTIALS')
    expect(nexoErrorCode('NEXO:MASTER_UNAVAILABLE')).toBe('MASTER_UNAVAILABLE')
  })

  it('falls back to UNKNOWN', () => {
    expect(nexoErrorCode(new Error('boom'))).toBe('UNKNOWN')
    expect(nexoErrorCode('NEXO:SOMETHING_ELSE')).toBe('UNKNOWN')
    expect(nexoErrorCode(undefined)).toBe('UNKNOWN')
  })
})
