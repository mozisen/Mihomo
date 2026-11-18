import { Button, Card, CardBody, CardHeader, Divider } from '@heroui/react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoWifi } from 'react-icons/io5'
import { SiApple, SiGithub, SiGoogle, SiYoutube } from 'react-icons/si'
import { nexoSiteLatency } from '@renderer/utils/ipc'
import { SITE_TARGETS, type SiteKey } from '../../../../shared/netcheck'

const ICONS: Record<SiteKey, React.ReactNode> = {
  apple: <SiApple className="text-2xl" />,
  github: <SiGithub className="text-2xl" />,
  google: <SiGoogle className="text-2xl text-[#4285F4]" />,
  youtube: <SiYoutube className="text-2xl text-[#FF0000]" />
}

/** undefined 未测，'testing' 测试中，null 超时，数字为毫秒 */
type Result = number | null | 'testing' | undefined

export function latencyClass(ms: number | null): string {
  if (ms === null) return 'text-danger'
  if (ms < 300) return 'text-success'
  if (ms < 800) return 'text-warning'
  return 'text-danger'
}

export const SiteResult: React.FC<{ result: Result }> = ({ result }) => {
  const { t } = useTranslation()
  if (result === undefined) return <>{t('netcheck.site.test')}</>
  if (result === 'testing') return <>{t('netcheck.site.testing')}</>
  if (result === null) return <span className="text-danger">{t('netcheck.site.timeout')}</span>
  return <span className={latencyClass(result)}>{result} ms</span>
}

const SiteLatencyCard: React.FC = () => {
  const { t } = useTranslation()
  const [results, setResults] = useState<Partial<Record<SiteKey, Result>>>({})

  const test = async (key: SiteKey): Promise<void> => {
    setResults((r) => ({ ...r, [key]: 'testing' }))
    const ms = await nexoSiteLatency(key).catch(() => null)
    setResults((r) => ({ ...r, [key]: ms }))
  }
  const testAll = (): void => {
    for (const site of SITE_TARGETS) void test(site.key)
  }

  return (
    <Card shadow="sm" data-testid="site-latency-card">
      <CardHeader className="flex items-center justify-between px-4 py-3">
        <span className="font-bold">{t('netcheck.site.title')}</span>
        <Button
          size="sm"
          variant="light"
          isIconOnly
          aria-label={t('netcheck.site.testAll')}
          title={t('netcheck.site.testAll')}
          onPress={testAll}
        >
          <IoWifi className="text-lg" />
        </Button>
      </CardHeader>
      <Divider />
      <CardBody className="grid grid-cols-4 gap-2 p-3">
        {SITE_TARGETS.map((site) => (
          <button
            key={site.key}
            type="button"
            data-testid={`site-${site.key}`}
            className="flex flex-col items-center gap-1 rounded-lg bg-content2 px-1 py-3 text-sm hover:bg-content3 disabled:opacity-70"
            disabled={results[site.key] === 'testing'}
            onClick={() => void test(site.key)}
          >
            {ICONS[site.key]}
            <span className="text-foreground-500">{site.name}</span>
            <span className="w-3/4 border-t border-default-200" />
            <span className="text-xs text-primary">
              <SiteResult result={results[site.key]} />
            </span>
          </button>
        ))}
      </CardBody>
    </Card>
  )
}

export default SiteLatencyCard
