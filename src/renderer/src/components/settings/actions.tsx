import { Button, Tooltip } from '@heroui/react'
import { nexoCheckForUpdate, quitApp, quitWithoutCore, resetAppConfig } from '@renderer/utils/ipc'
import { toast } from '@renderer/components/base/toast'
import { useState } from 'react'
import { version } from '@renderer/utils/init'
import { IoIosHelpCircle } from 'react-icons/io'
import { getDriver } from '@renderer/App'
import { useTranslation } from 'react-i18next'
import SettingItem from '../base/base-setting-item'
import SettingCard from '../base/base-setting-card'
import BaseConfirmModal from '../base/base-confirm-modal'

const Actions: React.FC = () => {
  const { t } = useTranslation()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // 有新版本时由主进程弹出系统对话框；这里只提示“已是最新”与失败
  const checkUpdate = async (): Promise<void> => {
    setCheckingUpdate(true)
    try {
      const result = await nexoCheckForUpdate()
      if (result.status === 'upToDate') {
        toast.success(t('actions.checkUpdate.upToDate', { version: result.version }))
      } else if (result.status === 'error') {
        toast.error(t('actions.checkUpdate.failed', { message: result.message }))
      }
    } catch (e) {
      toast.error(t('actions.checkUpdate.failed', { message: String(e) }))
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <>
      {showResetConfirm && (
        <BaseConfirmModal
          isOpen={showResetConfirm}
          title={t('actions.reset.confirm.title')}
          content={t('actions.reset.confirm.content')}
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            resetAppConfig()
            setShowResetConfirm(false)
          }}
        />
      )}
      <SettingCard>
        <SettingItem title={t('actions.guide.title')} divider>
          <Button size="sm" onPress={() => getDriver()?.drive()}>
            {t('actions.guide.button')}
          </Button>
        </SettingItem>
        <SettingItem
          title={t('actions.reset.title')}
          actions={
            <Tooltip content={t('actions.reset.tooltip')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={() => setShowResetConfirm(true)}>
            {t('actions.reset.button')}
          </Button>
        </SettingItem>
        <SettingItem
          title={t('actions.lightMode.title')}
          actions={
            <Tooltip content={t('actions.lightMode.tooltip')}>
              <Button isIconOnly size="sm" variant="light">
                <IoIosHelpCircle className="text-lg" />
              </Button>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onPress={quitWithoutCore}>
            {t('actions.lightMode.button')}
          </Button>
        </SettingItem>
        <SettingItem title={t('actions.quit.title')} divider>
          <Button size="sm" onPress={quitApp}>
            {t('actions.quit.button')}
          </Button>
        </SettingItem>
        <SettingItem title={t('actions.checkUpdate.title')} divider>
          <Button size="sm" isLoading={checkingUpdate} onPress={checkUpdate}>
            {t('actions.checkUpdate.button')}
          </Button>
        </SettingItem>
        <SettingItem title={t('actions.version.title')}>
          <div>v{version}</div>
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default Actions
