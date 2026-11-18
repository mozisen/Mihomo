import { describe, expect, it, vi } from 'vitest'
import { fraudScoreLevel } from '../../shared/netcheck'
import {
  IPPURE_INFO_URL,
  buildExitIpInfo,
  domainFromWebsite,
  fetchExitIpInfo,
  measureSite
} from './netcheck'

const ippure = {
  ip: '183.12.106.133',
  asn: 4134,
  asOrganization: 'CHINANET BACKBONE',
  country: 'China',
  countryCode: 'cn',
  fraudScore: 7,
  isResidential: true,
  isBroadcast: false
}

describe('buildExitIpInfo', () => {
  it('combines IPPure, IP2Location and PeeringDB', () => {
    expect(
      buildExitIpInfo(
        ippure,
        { country_name: 'China', region_name: 'Guangdong', city_name: 'Shenzhen' },
        { data: [{ website: 'http://www.chinatelecom.com.cn/' }] }
      )
    ).toEqual({
      ip: '183.12.106.133',
      countryCode: 'CN',
      country: 'China',
      asn: 4134,
      asOrganization: 'CHINANET BACKBONE',
      asDomain: 'chinatelecom.com.cn',
      ip2location: 'China, Guangdong, Shenzhen',
      timezone: undefined,
      native: true,
      residential: true,
      fraudScore: 7
    })
  })

  it('leaves optional fields empty and clamps the score', () => {
    const info = buildExitIpInfo({ ip: '1.1.1.1', fraudScore: 140, isBroadcast: true })
    expect(info.asDomain).toBeUndefined()
    expect(info.ip2location).toBeUndefined()
    expect(info.native).toBe(false)
    expect(info.residential).toBeUndefined()
    expect(info.fraudScore).toBe(100)
  })

  it('drops repeated location parts', () => {
    const info = buildExitIpInfo(ippure, {
      country_name: 'Taiwan',
      region_name: 'Taiwan',
      city_name: 'Taichung'
    })
    expect(info.ip2location).toBe('Taiwan, Taichung')
  })

  it('rejects a response without an IP', () => {
    expect(() => buildExitIpInfo({})).toThrow()
  })
})

describe('domainFromWebsite', () => {
  it('extracts a bare domain', () => {
    expect(domainFromWebsite('https://www.example.com/path')).toBe('example.com')
    expect(domainFromWebsite('example.net')).toBe('example.net')
    expect(domainFromWebsite('http://en.chinatelecom.com.cn/')).toBe('chinatelecom.com.cn')
    expect(domainFromWebsite('')).toBeUndefined()
    expect(domainFromWebsite('http://')).toBeUndefined()
  })
})

describe('fetchExitIpInfo', () => {
  it('still answers when the extra lookups fail', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === IPPURE_INFO_URL) return ippure
      throw new Error('rate limited')
    })
    const info = await fetchExitIpInfo({ get })
    expect(info.ip).toBe('183.12.106.133')
    expect(info.ip2location).toBeUndefined()
    expect(get).toHaveBeenCalledWith(
      'https://api.ip2location.io/?ip=183.12.106.133',
      expect.anything()
    )
    expect(get).toHaveBeenCalledWith(
      'https://www.peeringdb.com/api/net?asn=4134&fields=website',
      expect.anything()
    )
  })

  it('fails when IPPure is unreachable', async () => {
    await expect(
      fetchExitIpInfo({ get: async () => Promise.reject(new Error('down')) })
    ).rejects.toThrow()
  })
})

describe('measureSite', () => {
  it('returns the elapsed time or null on failure', async () => {
    let t = 1000
    const now = (): number => t
    await expect(measureSite({ now, get: async () => void (t += 120) }, 'google')).resolves.toBe(
      120
    )
    await expect(
      measureSite({ now, get: async () => Promise.reject(new Error('timeout')) }, 'apple')
    ).resolves.toBeNull()
  })

  it('only tests the built-in sites', async () => {
    await expect(measureSite({ get: async () => '' }, 'evil' as never)).rejects.toThrow()
  })
})

describe('fraudScoreLevel', () => {
  it('matches the IPPure scale', () => {
    expect(fraudScoreLevel(7).key).toBe('veryClean')
    expect(fraudScoreLevel(15).key).toBe('clean')
    expect(fraudScoreLevel(45).key).toBe('slightRisk')
    expect(fraudScoreLevel(100).key).toBe('veryHighRisk')
  })
})
