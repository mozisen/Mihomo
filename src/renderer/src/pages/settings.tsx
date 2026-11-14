import BasePage from '@renderer/components/base/base-page'
import GeneralConfig from '@renderer/components/settings/general-config'
import MihomoConfig from '@renderer/components/settings/mihomo-config'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import { useTranslation } from 'react-i18next'

const Settings: React.FC = () => {
  const { t } = useTranslation()

  return (
    <BasePage title={t('settings.title')}>
      <GeneralConfig />
      <MihomoConfig />
      <ShortcutConfig />
      <Actions />
    </BasePage>
  )
}

export default Settings
