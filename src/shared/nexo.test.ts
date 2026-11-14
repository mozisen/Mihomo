import { describe, expect, it } from 'vitest'
import { nexoErrorCode, nexoErrorDetail } from './nexo'

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

describe('nexoErrorDetail', () => {
  it('extracts the detail after the code', () => {
    expect(
      nexoErrorDetail(
        new Error("Error invoking remote method 'nexoLogin': NEXO:UNKNOWN|HTTP 403: stale request")
      )
    ).toBe('HTTP 403: stale request')
    expect(nexoErrorCode('NEXO:UNKNOWN|HTTP 403: x')).toBe('UNKNOWN')
    expect(nexoErrorDetail('NEXO:UNKNOWN')).toBeUndefined()
  })
})
