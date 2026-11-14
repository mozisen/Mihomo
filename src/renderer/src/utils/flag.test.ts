import { describe, expect, it } from 'vitest'
import { countryFlagEmoji } from './flag'

describe('countryFlagEmoji', () => {
  it('turns ISO country codes into flag emoji', () => {
    expect(countryFlagEmoji('us')).toBe('🇺🇸')
    expect(countryFlagEmoji('JP')).toBe('🇯🇵')
    expect(countryFlagEmoji('Hk')).toBe('🇭🇰')
  })

  it('rejects anything that is not a two-letter code', () => {
    expect(countryFlagEmoji()).toBeNull()
    expect(countryFlagEmoji('')).toBeNull()
    expect(countryFlagEmoji('USA')).toBeNull()
    expect(countryFlagEmoji('1a')).toBeNull()
  })
})
