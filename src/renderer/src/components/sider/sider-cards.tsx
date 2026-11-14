import { useLayoutEffect } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  Modifier,
  CollisionDetection
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { NavigateFunction, useNavigate } from 'react-router-dom'
import SysproxySwitcher from '@renderer/components/sider/sysproxy-switcher'
import TunSwitcher from '@renderer/components/sider/tun-switcher'
import AccountCard from '@renderer/components/sider/account-card'
import ProxyCard from '@renderer/components/sider/proxy-card'
import RuleCard from '@renderer/components/sider/rule-card'
import ConnCard from '@renderer/components/sider/conn-card'
import LogCard from '@renderer/components/sider/log-card'
import MihomoCoreCard from '@renderer/components/sider/mihomo-core-card'
import ResourceCard from '@renderer/components/sider/resource-card'
import NetworkCard from '@renderer/components/sider/network-card'
import UsageCard from '@renderer/components/sider/usage-card'
import { SIDER_CARD_KEYS, SIDER_CARD_ROUTES } from '@renderer/utils/sider'
import { markInitialContentPartReady } from '@renderer/utils/startup'

const componentMap: Record<SiderCardKey, React.FC<{ iconOnly?: boolean; expanded?: boolean }>> = {
  sysproxy: SysproxySwitcher,
  tun: TunSwitcher,
  profile: AccountCard,
  proxy: ProxyCard,
  mihomo: MihomoCoreCard,
  connection: ConnCard,
  log: LogCard,
  rule: RuleCard,
  resource: ResourceCard,
  network: NetworkCard,
  usage: UsageCard
}

interface Props {
  iconOnly?: boolean
  expanded?: boolean
}

const SiderCards = (props: Props): React.JSX.Element => {
  const { iconOnly = false, expanded = false } = props
  const sensors = useSensors(useSensor(PointerSensor))
  const navigate: NavigateFunction = useNavigate()

  useLayoutEffect(() => {
    markInitialContentPartReady('sider')
  }, [])

  // 卡片仍用 dnd-kit 的 sortable 包装（点击即导航），但顺序固定、不可拖动。
  const onDragEnd = (event: DragEndEvent): void => {
    const dest = SIDER_CARD_ROUTES[event.active.id as SiderCardKey]
    if (dest) navigate(dest)
  }
  const lockTransform: Modifier = (args) => ({ ...args.transform, x: 0, y: 0 })
  const collisionDetection: CollisionDetection = () => []

  const cards = SIDER_CARD_KEYS.map((key) => {
    const Component = componentMap[key]
    return <Component key={key} iconOnly={iconOnly} expanded={expanded} />
  })

  if (iconOnly) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div className="min-h-full w-full flex flex-col gap-2">{cards}</div>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'clip' }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={onDragEnd}
        modifiers={[lockTransform]}
      >
        <div className="grid grid-cols-2 gap-2 m-2">
          <SortableContext items={[...SIDER_CARD_KEYS]}>{cards}</SortableContext>
        </div>
      </DndContext>
    </div>
  )
}

export default SiderCards
