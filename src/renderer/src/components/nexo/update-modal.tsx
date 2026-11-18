import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress
} from '@heroui/react'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoArrowForward } from 'react-icons/io5'
import { nexoGetUpdateState, nexoUpdateDismiss, nexoUpdateRespond } from '@renderer/utils/ipc'
import type { UpdatePromptState } from '../../../../shared/update'
import NexoLogo from '../base/nexo-logo'

/** 更新提示：与应用其他弹窗同一风格（HeroUI Modal），取代系统原生对话框。 */
export const UpdateModalView: React.FC<{
  state: UpdatePromptState
  onRespond: (accept: boolean) => void
  onDismiss: () => void
}> = ({ state, onRespond, onDismiss }) => {
  const { t } = useTranslation()
  if (state.phase === 'idle') return null
  const downloading = state.phase === 'downloading'
  const failed = state.phase === 'error'
  return (
    <Modal
      backdrop="blur"
      classNames={{ backdrop: 'top-[48px]' }}
      hideCloseButton
      isDismissable={false}
      isKeyboardDismissDisabled
      isOpen
      size="sm"
    >
      <ModalContent data-testid="update-modal">
        <ModalHeader className="flex app-drag items-center gap-3">
          <NexoLogo className="h-9 w-9" />
          <span>{t(failed ? 'update.failedTitle' : 'update.availableTitle')}</span>
        </ModalHeader>
        <ModalBody className="gap-3">
          <div className="flex items-center gap-2 text-sm" data-testid="update-versions">
            <Chip size="sm" variant="flat">
              v{state.current}
            </Chip>
            <IoArrowForward className="text-foreground-400" />
            <Chip size="sm" variant="flat" color="primary">
              v{state.version}
            </Chip>
          </div>
          {state.notes && (
            <div className="rounded-lg bg-content2 px-3 py-2 text-sm">
              <div className="mb-1 text-xs text-foreground-500">{t('update.notes')}</div>
              <p className="whitespace-pre-wrap select-text" data-testid="update-notes">
                {state.notes}
              </p>
            </div>
          )}
          {downloading && (
            <Progress
              size="sm"
              aria-label={t('update.downloading')}
              label={t('update.downloading')}
              value={Math.round(state.progress * 100)}
              showValueLabel
              data-testid="update-progress"
            />
          )}
          {failed && (
            <p className="text-sm text-danger break-all" data-testid="update-error">
              {state.message}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          {failed ? (
            <Button size="sm" color="primary" onPress={onDismiss}>
              {t('update.close')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="light"
                isDisabled={downloading}
                onPress={() => onRespond(false)}
              >
                {t('update.later')}
              </Button>
              <Button
                size="sm"
                color="primary"
                isLoading={downloading}
                onPress={() => onRespond(true)}
              >
                {t('update.installNow')}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

const UpdateModal: React.FC = () => {
  const [state, setState] = useState<UpdatePromptState>({ phase: 'idle' })
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('nexoUpdateState', (_e, next) =>
      setState(next as UpdatePromptState)
    )
    // 窗口晚于提示打开时（如静默启动），补取当前状态
    void nexoGetUpdateState()
      .then(setState)
      .catch(() => undefined)
    return unsubscribe
  }, [])
  return (
    <UpdateModalView
      state={state}
      onRespond={(accept) => void nexoUpdateRespond(accept)}
      onDismiss={() => void nexoUpdateDismiss()}
    />
  )
}

export default UpdateModal
