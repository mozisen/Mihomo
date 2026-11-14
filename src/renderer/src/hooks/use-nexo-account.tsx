import React, { createContext, ReactNode, useContext, useEffect } from 'react'
import useSWR, { KeyedMutator } from 'swr'
import { nexoGetAccountState } from '@renderer/utils/ipc'
import type { NexoAccountState } from '../../../shared/nexo'

interface NexoAccountContextValue {
  state: NexoAccountState
  mutate: KeyedMutator<NexoAccountState>
}

const LOADING: NexoAccountState = { status: 'loading' }

const NexoAccountContext = createContext<NexoAccountContextValue | undefined>(undefined)

export const NexoAccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data, mutate } = useSWR('nexoGetAccountState', () => nexoGetAccountState())

  useEffect(() => {
    // 主进程推送最新状态（登录、同步进度、会话失效）
    return window.electron.ipcRenderer.on('nexoAccountChanged', (_e, ...args: unknown[]) => {
      const state = args[0] as NexoAccountState | undefined
      if (state && typeof state === 'object' && 'status' in state) {
        void mutate(state, { revalidate: false })
      } else {
        void mutate()
      }
    })
  }, [mutate])

  return (
    <NexoAccountContext.Provider value={{ state: data ?? LOADING, mutate }}>
      {children}
    </NexoAccountContext.Provider>
  )
}

export function useNexoAccount(): NexoAccountContextValue {
  const context = useContext(NexoAccountContext)
  if (!context) throw new Error('useNexoAccount must be used within NexoAccountProvider')
  return context
}
