import { Button, Card, CardBody, CardFooter } from '@heroui/react'
import React from 'react'
import { IoPersonCircleOutline } from 'react-icons/io5'
import { useLocation } from 'react-router-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useTranslation } from 'react-i18next'
import SiderItem from './sider-item'

interface Props {
  iconOnly?: boolean
  expanded?: boolean
}

// NEXO 定制：占用原“配置”卡片的位置（sider key 仍为 `profile`），入口指向账户登录页。
const AccountCard: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const { iconOnly, expanded } = props
  const { profileCardStatus = 'col-span-2', disableAnimations = false } = appConfig || {}
  const location = useLocation()
  const match = location.pathname.includes('/account')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: 'profile'
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null

  if (iconOnly) {
    return (
      <SiderItem
        className={profileCardStatus}
        title={t('sider.cards.account')}
        route="/account"
        icon={<IoPersonCircleOutline className="text-[20px]" />}
        expanded={expanded}
      />
    )
  }

  const textColor = match ? 'text-primary-foreground' : 'text-foreground'

  return (
    <div
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
      className={`${profileCardStatus} account-card`}
    >
      <Card
        fullWidth
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`${match ? 'bg-primary' : 'hover:bg-primary/30'} ${disableAnimations ? '' : `motion-reduce:transition-transform-background ${isDragging ? 'scale-[0.95] tap-highlight-transparent' : ''}`}`}
      >
        <CardBody className="pb-1 pt-0 px-0">
          <div className="flex justify-between items-center">
            <Button
              isIconOnly
              className="bg-transparent pointer-events-none"
              variant="flat"
              color="default"
            >
              <IoPersonCircleOutline color="default" className={`${textColor} text-[24px]`} />
            </Button>
            {profileCardStatus === 'col-span-2' && (
              <span className={`mr-3 text-sm ${match ? textColor : 'text-foreground-500'}`}>
                {t('account.status.notLoggedIn')}
              </span>
            )}
          </div>
        </CardBody>
        <CardFooter className="pt-1">
          <h3
            className={`text-md font-bold text-ellipsis whitespace-nowrap overflow-hidden ${textColor}`}
          >
            {t('sider.cards.account')}
          </h3>
        </CardFooter>
      </Card>
    </div>
  )
}

export default AccountCard
