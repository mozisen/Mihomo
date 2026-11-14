import { Spinner } from '@heroui/react'
import React, { ReactNode } from 'react'
import { useNexoAccount } from '@renderer/hooks/use-nexo-account'
import type { NexoAccountState } from '../../../../shared/nexo'
import LoginPanel from './login-panel'

/** 未登录时整窗遮挡应用：必须先登录 NEXO 账户才能使用配置。 */
export function isGateOpen(state: NexoAccountState): boolean {
  return state.status === 'loggedIn'
}

// 应用本身始终渲染（首屏就绪信号依赖它，内核启动在其后），登录界面作为覆盖层盖在上面
const LoginGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state } = useNexoAccount()
  const open = isGateOpen(state)
  return (
    <>
      <div aria-hidden={!open} inert={!open} className="contents">
        {children}
      </div>
      {!open && (
        <div
          role="dialog"
          aria-modal="true"
          className="nexo-login-gate fixed inset-0 z-[100] flex flex-col bg-background"
        >
          <div className="app-drag h-11.25 shrink-0" />
          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            {state.status === 'loading' ? <Spinner size="lg" /> : <LoginPanel />}
          </div>
        </div>
      )}
    </>
  )
}

export default LoginGate
