// 更新提示的状态机：Updater 询问“是否更新” → 等渲染进程弹窗里的回答；下载进度与失败也在弹窗里显示。
import type { UpdatePromptState } from '../../shared/update'
import type { AvailableUpdate } from './updater'

export class UpdatePrompt {
  private state: UpdatePromptState = { phase: 'idle' }
  private answer?: (accept: boolean) => void

  constructor(
    private readonly current: string,
    private readonly onChange: (state: UpdatePromptState) => void
  ) {}

  getState(): UpdatePromptState {
    return this.state
  }

  private set(state: UpdatePromptState): void {
    this.state = state
    this.onChange(state)
  }

  /** Updater.confirm：显示弹窗并等用户选择 */
  confirm(update: AvailableUpdate): Promise<boolean> {
    this.answer?.(false)
    this.set({
      phase: 'available',
      version: update.version,
      current: this.current,
      notes: update.notes || undefined
    })
    return new Promise((resolve) => {
      this.answer = resolve
    })
  }

  /** 弹窗按钮：立即更新 / 稍后 */
  respond(accept: boolean): void {
    const answer = this.answer
    this.answer = undefined
    if (this.state.phase !== 'available') return
    if (accept) this.set({ ...this.state, phase: 'downloading', progress: 0 })
    else this.set({ phase: 'idle' })
    answer?.(accept)
  }

  progress(ratio: number): void {
    if (this.state.phase !== 'downloading' || ratio < 0) return
    const progress = Math.max(0, Math.min(1, ratio))
    // 只在变化超过 1% 时推送，避免刷屏
    if (progress === 1 || Math.abs(progress - this.state.progress) >= 0.01) {
      this.set({ ...this.state, progress })
    }
  }

  error(message: string): void {
    if (this.state.phase === 'idle') return
    const { version, current, notes } = this.state
    this.set({ phase: 'error', version, current, notes, message })
  }

  /** 失败后关闭弹窗 */
  dismiss(): void {
    if (this.state.phase === 'error') this.set({ phase: 'idle' })
  }
}
