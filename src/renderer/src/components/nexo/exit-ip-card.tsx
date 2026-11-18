import { Button, Card, CardBody, CardHeader, Chip, Divider, Spinner } from '@heroui/react'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoEye, IoEyeOff, IoRefresh } from 'react-icons/io5'
import { nexoExitIpInfo } from '@renderer/utils/ipc'
import { countryFlagEmoji } from '@renderer/utils/flag'
import { FRAUD_SCORE_LEVELS, fraudScoreLevel, type ExitIpInfo } from '../../../../shared/netcheck'

/** 隐藏 IP：只留首段，其余换成点 */
export function maskIp(ip: string): string {
  const v4 = ip.split('.')
  if (v4.length === 4) return `${v4[0]}.•••.•••.•••`
  return `${ip.split(':')[0]}:••••`
}

const Row: React.FC<{ label: string; testId: string; children?: React.ReactNode }> = ({
  label,
  testId,
  children
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm" data-testid={testId}>
      <span className="shrink-0 text-foreground-500">{label}</span>
      <span className="text-right font-medium break-all select-text">
        {children ?? t('account.info.unavailable')}
      </span>
    </div>
  )
}

export const FraudScoreBar: React.FC<{ score: number }> = ({ score }) => {
  const { t } = useTranslation()
  const level = fraudScoreLevel(score)
  let prev = 0
  return (
    <div className="flex w-full flex-col gap-1" data-testid="fraud-score">
      <div className="text-sm font-bold" style={{ color: level.color }}>
        {score}% {t(`netcheck.ip.level.${level.key}`)}
      </div>
      <div className="relative flex h-1.5 w-full overflow-hidden rounded-full">
        {FRAUD_SCORE_LEVELS.map((l) => {
          const width = l.max - prev
          prev = l.max
          return <div key={l.key} style={{ width: `${width}%`, background: l.color }} />
        })}
      </div>
      <div className="relative h-2">
        <div
          className="absolute -top-1 h-0 w-0 -translate-x-1/2 border-x-4 border-b-4 border-x-transparent border-b-foreground"
          style={{ left: `${score}%` }}
        />
      </div>
    </div>
  )
}

export const ExitIpDetails: React.FC<{ info: ExitIpInfo }> = ({ info }) => {
  const { t } = useTranslation()
  const [showIp, setShowIp] = useState(false)
  const flag = countryFlagEmoji(info.countryCode)
  return (
    <>
      <div className="flex items-center justify-between gap-4 py-2">
        <span className="flex items-center gap-2 text-lg font-bold">
          {flag && <span>{flag}</span>}
          {info.countryCode ?? '—'}
        </span>
        <span className="flex items-center gap-1 font-mono text-sm" data-testid="exit-ip">
          {showIp ? info.ip : maskIp(info.ip)}
          <Button
            size="sm"
            variant="light"
            isIconOnly
            aria-label={t('netcheck.ip.toggleIp')}
            onPress={() => setShowIp((v) => !v)}
          >
            {showIp ? <IoEyeOff /> : <IoEye />}
          </Button>
        </span>
      </div>
      <Divider />
      <Row label="ASN" testId="ip-asn">
        {info.asn !== undefined
          ? `AS${info.asn}${info.asOrganization ? ` - ${info.asOrganization}` : ''}`
          : undefined}
      </Row>
      <Row label={t('netcheck.ip.asDomain')} testId="ip-as-domain">
        {info.asDomain}
      </Row>
      <Row label="IP2Location" testId="ip-ip2location">
        {info.ip2location}
      </Row>
      <Row label={t('netcheck.ip.source')} testId="ip-source">
        {info.native === undefined ? undefined : (
          <Chip size="sm" variant="flat" color={info.native ? 'success' : 'warning'}>
            {t(info.native ? 'netcheck.ip.native' : 'netcheck.ip.broadcast')}
          </Chip>
        )}
      </Row>
      <Row label={t('netcheck.ip.type')} testId="ip-type">
        {info.residential === undefined ? undefined : (
          <Chip size="sm" variant="flat" color={info.residential ? 'success' : 'warning'}>
            {t(info.residential ? 'netcheck.ip.residential' : 'netcheck.ip.datacenter')}
          </Chip>
        )}
      </Row>
      <div className="flex flex-col gap-2 py-2 text-sm" data-testid="ip-score">
        <span className="text-foreground-500">{t('netcheck.ip.score')}</span>
        {info.fraudScore === undefined ? (
          <span>{t('account.info.unavailable')}</span>
        ) : (
          <FraudScoreBar score={info.fraudScore} />
        )}
      </div>
    </>
  )
}

const ExitIpCard: React.FC = () => {
  const { t } = useTranslation()
  const [info, setInfo] = useState<ExitIpInfo>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(false)
    try {
      setInfo(await nexoExitIpInfo())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开账户页时查一次；之后手动刷新，不轮询（第三方接口有频率限制）
  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card shadow="sm" data-testid="exit-ip-card">
      <CardHeader className="flex items-center justify-between px-4 py-3">
        <span className="font-bold">{t('netcheck.ip.title')}</span>
        <Button
          size="sm"
          variant="light"
          isIconOnly
          aria-label={t('netcheck.ip.refresh')}
          title={t('netcheck.ip.refresh')}
          isDisabled={loading}
          onPress={() => void load()}
        >
          {loading ? <Spinner size="sm" /> : <IoRefresh className="text-lg" />}
        </Button>
      </CardHeader>
      <Divider />
      <CardBody className="px-4 py-1">
        {info ? (
          <ExitIpDetails info={info} />
        ) : (
          <div className="py-6 text-center text-sm text-foreground-500">
            {error ? t('netcheck.ip.failed') : t('netcheck.ip.loading')}
          </div>
        )}
        {info && error && <p className="pb-2 text-xs text-danger">{t('netcheck.ip.failed')}</p>}
      </CardBody>
    </Card>
  )
}

export default ExitIpCard
