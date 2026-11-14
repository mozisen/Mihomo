import { Button, Card, CardBody, Chip, Divider, Progress } from '@heroui/react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoLogOutOutline, IoPersonCircle, IoRefresh } from 'react-icons/io5'
import BasePage from '@renderer/components/base/base-page'
import BaseConfirmModal from '@renderer/components/base/base-confirm-modal'
import LoginPanel from '@renderer/components/nexo/login-panel'
import { useNexoAccount } from '@renderer/hooks/use-nexo-account'
import { nexoLogout, nexoRefresh } from '@renderer/utils/ipc'
import { buildAccountView } from '@renderer/utils/nexo-account'
import { nexoErrorCode, type NexoAccountInfo } from '../../../shared/nexo'

export { validateLoginForm } from '@renderer/components/nexo/login-panel'
export type { LoginForm, LoginFormErrors } from '@renderer/components/nexo/login-panel'

function formatTime(ms?: number): string | undefined {
  if (!ms) return undefined
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const InfoRow: React.FC<{ label: string; value?: string; testId: string }> = ({
  label,
  value,
  testId
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm" data-testid={testId}>
      <span className="text-foreground-500 shrink-0">{label}</span>
      <span className="font-medium text-right break-all select-text">
        {value ?? t('account.info.unavailable')}
      </span>
    </div>
  )
}

export const AccountDetails: React.FC<{
  account: NexoAccountInfo
  syncing: boolean
  error?: string
}> = ({ account, syncing, error }) => {
  const { t } = useTranslation()
  const { mutate } = useNexoAccount()
  const [refreshError, setRefreshError] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const view = buildAccountView(account)
  const shownError = refreshError || (error ? t('account.error.syncFailed') : '')

  const refresh = async (): Promise<void> => {
    setRefreshError('')
    try {
      await nexoRefresh()
    } catch (e) {
      setRefreshError(t(`account.error.${nexoErrorCode(e)}`))
    } finally {
      void mutate()
    }
  }

  const logout = async (): Promise<void> => {
    setLoggingOut(true)
    try {
      await nexoLogout()
    } finally {
      setLoggingOut(false)
      setConfirmLogout(false)
      void mutate()
    }
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      <Card shadow="sm">
        <CardBody className="flex flex-row items-center gap-3 p-4">
          <IoPersonCircle className="text-5xl text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold truncate" data-testid="account-name">
              {view.displayName}
            </h2>
            <p className="text-sm text-foreground-500 truncate">
              {account.email || account.username}
            </p>
          </div>
          <Chip color="success" variant="flat" size="sm">
            {t('account.status.online')}
          </Chip>
        </CardBody>
      </Card>

      <Card shadow="sm">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{t('account.traffic.title')}</h3>
            {account.subscriptionName && (
              <span className="text-sm text-foreground-500">{account.subscriptionName}</span>
            )}
          </div>
          {view.percent !== undefined && (
            <Progress
              aria-label={t('account.traffic.title')}
              value={view.percent}
              color={view.percent >= 90 ? 'danger' : view.percent >= 70 ? 'warning' : 'primary'}
              size="sm"
            />
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div data-testid="traffic-used">
              <div className="text-xs text-foreground-500">{t('account.traffic.used')}</div>
              <div className="font-bold">{view.used ?? t('account.info.unavailable')}</div>
            </div>
            <div data-testid="traffic-remaining">
              <div className="text-xs text-foreground-500">{t('account.traffic.remaining')}</div>
              <div className="font-bold">
                {view.unlimited
                  ? t('account.traffic.unlimited')
                  : (view.remaining ?? t('account.info.unavailable'))}
              </div>
            </div>
            <div data-testid="traffic-total">
              <div className="text-xs text-foreground-500">{t('account.traffic.total')}</div>
              <div className="font-bold">
                {view.unlimited
                  ? t('account.traffic.unlimited')
                  : (view.total ?? t('account.info.unavailable'))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card shadow="sm">
        <CardBody className="p-4 py-2">
          <InfoRow testId="info-expire" label={t('account.info.expire')} value={view.expire} />
          <Divider />
          <InfoRow testId="info-reset" label={t('account.info.resetDate')} value={view.reset} />
          <Divider />
          <InfoRow testId="info-ip" label={t('account.info.onlineIp')} value={view.onlineIps} />
          <Divider />
          <InfoRow
            testId="info-sync"
            label={t('account.info.lastSync')}
            value={formatTime(account.lastSync)}
          />
        </CardBody>
      </Card>

      {shownError && (
        <p role="alert" className="text-sm text-danger px-1">
          {shownError}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          color="primary"
          className="flex-1"
          isLoading={syncing}
          startContent={syncing ? undefined : <IoRefresh className="text-lg" />}
          onPress={() => void refresh()}
        >
          {t(syncing ? 'account.action.updating' : 'account.action.updateConfig')}
        </Button>
        <Button
          variant="flat"
          color="danger"
          startContent={<IoLogOutOutline className="text-lg" />}
          onPress={() => setConfirmLogout(true)}
        >
          {t('account.action.logout')}
        </Button>
      </div>

      {confirmLogout && (
        <BaseConfirmModal
          isOpen
          title={t('account.logout.title')}
          content={t('account.logout.content')}
          confirmText={t('account.action.logout')}
          isLoading={loggingOut}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => void logout()}
        />
      )}
    </div>
  )
}

const Account: React.FC = () => {
  const { t } = useTranslation()
  const { state } = useNexoAccount()
  return (
    <BasePage title={t('account.title')}>
      {state.status === 'loggedIn' ? (
        <AccountDetails account={state.account} syncing={state.syncing} error={state.error} />
      ) : (
        <div className="flex min-h-full items-center justify-center p-4">
          <LoginPanel />
        </div>
      )}
    </BasePage>
  )
}

export default Account
