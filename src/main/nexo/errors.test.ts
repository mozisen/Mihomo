import { describe, expect, it } from 'vitest'
import { MasterApiError } from './client'
import { errorCode, errorDetail } from './errors'
import { SecureChannelError } from './secureChannel'

describe('NEXO error mapping', () => {
  it('maps master errors to localizable codes', () => {
    expect(errorCode(new MasterApiError('invalid credentials', 401))).toBe('INVALID_CREDENTIALS')
    expect(errorCode(new MasterApiError('slow down', 429))).toBe('RATE_LIMITED')
    expect(errorCode(new SecureChannelError('down', 'cert_unavailable'))).toBe('MASTER_UNAVAILABLE')
    expect(errorCode(new SecureChannelError('bad', 'cert_invalid'))).toBe('MASTER_UNTRUSTED')
    expect(errorCode(new Error('NO_SUBSCRIPTION'))).toBe('NO_SUBSCRIPTION')
    expect(errorCode(new MasterApiError('stale request', 403))).toBe('UNKNOWN')
  })

  it('keeps the HTTP status and reason for troubleshooting', () => {
    expect(errorDetail(new MasterApiError('stale request', 403))).toBe('HTTP 403: stale request')
    expect(errorDetail(new SecureChannelError('envelope broken', 'bad_envelope'))).toBe(
      'bad_envelope: envelope broken'
    )
  })

  it('does not leak tokens in the detail', () => {
    const detail = errorDetail(new Error('bad token=mmwx_abcdefghijklmnop'))
    expect(detail).not.toContain('abcdefghijklmnop')
  })
})
