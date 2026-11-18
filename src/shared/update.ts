// 更新提示窗口的状态：主进程维护，推给渲染进程用应用内弹窗显示。
export type UpdatePromptState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string; current: string; notes?: string }
  | { phase: 'downloading'; version: string; current: string; notes?: string; progress: number }
  | { phase: 'error'; version: string; current: string; notes?: string; message: string }
