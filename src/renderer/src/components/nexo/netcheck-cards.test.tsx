import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/utils/ipc', () => ({
  nexoSiteLatency: vi.fn(),
  nexoExitIpInfo: vi.fn(async () => new Promise(() => {}))
}))

describe('ExitIpDetails', () => {
  it('shows the requested fields and hides the IP by default', async () => {
    const { ExitIpDetails } = await import('./exit-ip-card')
    const html = renderToStaticMarkup(
      <ExitIpDetails
        info={{
          ip: '183.12.106.133',
          countryCode: 'CN',
          asn: 4134,
          asOrganization: 'CHINANET BACKBONE',
          asDomain: 'chinatelecom.com.cn',
          ip2location: 'China, Guangdong, Shenzhen',
          native: true,
          residential: true,
          fraudScore: 7
        }}
      />
    )
    expect(html).toContain('183.•••.•••.•••')
    expect(html).not.toContain('183.12.106.133')
    expect(html).toMatch(/data-testid="ip-asn".*AS4134 - CHINANET BACKBONE/)
    expect(html).toMatch(/data-testid="ip-as-domain".*chinatelecom\.com\.cn/)
    expect(html).toMatch(/data-testid="ip-ip2location".*China, Guangdong, Shenzhen/)
    expect(html).toMatch(/data-testid="ip-source".*netcheck\.ip\.native/)
    expect(html).toMatch(/data-testid="ip-type".*netcheck\.ip\.residential/)
    expect(html).toMatch(/7% netcheck\.ip\.level\.veryClean/)
  })

  it('shows placeholders for missing data', async () => {
    const { ExitIpDetails } = await import('./exit-ip-card')
    const html = renderToStaticMarkup(<ExitIpDetails info={{ ip: '2001:db8::1' }} />)
    expect(html).toContain('2001:••••')
    expect(html).toMatch(/data-testid="ip-as-domain".*account\.info\.unavailable/)
  })
})

describe('SiteLatencyCard', () => {
  it('lists the four sites with a test action', async () => {
    const { default: SiteLatencyCard, latencyClass } = await import('./site-latency-card')
    const html = renderToStaticMarkup(<SiteLatencyCard />)
    for (const name of ['Apple', 'GitHub', 'Google', 'YouTube']) expect(html).toContain(name)
    expect(html.match(/netcheck\.site\.test</g)).toHaveLength(4)
    expect(latencyClass(120)).toBe('text-success')
    expect(latencyClass(null)).toBe('text-danger')
  })
})
