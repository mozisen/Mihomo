// 自动更新在主进程中的实例：打开软件并登录后检查一次，有新版本时用系统对话框提示。
import path from 'path'
import { app, dialog, shell } from 'electron'
import i18next from 'i18next'
import { createLogger } from '../utils/logger'
import { Updater, type UpdateCheckResult } from './updater'

const logger = createLogger('Updater')

/** 登录后多久检查更新：避开启动时内核与订阅更新的高峰 */
const CHECK_DELAY_MS = 8_000

let updater: Updater | undefined
let scheduled = false

async function window(): Promise<Electron.BrowserWindow | undefined> {
  const { mainWindow } = await import('../window')
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
}

function nexoUpdater(): Updater {
  if (!updater) {
    updater = new Updater({
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      downloadDir: path.join(app.getPath('temp'), 'nexo-update'),
      confirm: async (update) => {
        const win = await window()
        const options: Electron.MessageBoxOptions = {
          type: 'info',
          title: i18next.t('update.availableTitle'),
          message: i18next.t('update.availableMessage', { version: update.version }),
          detail: [
            i18next.t('update.currentVersion', { version: app.getVersion() }),
            update.notes ?? ''
          ]
            .filter(Boolean)
            .join('\n\n'),
          buttons: [i18next.t('update.later'), i18next.t('update.installNow')],
          defaultId: 1,
          cancelId: 0
        }
        const { response } = win
          ? await dialog.showMessageBox(win, options)
          : await dialog.showMessageBox(options)
        return response === 1
      },
      onProgress: (ratio) => {
        void window().then((win) => win?.setProgressBar(ratio))
      },
      // 安装包需要管理员权限：交给系统打开（会弹出 UAC），不能直接 spawn
      launch: (file) => shell.openPath(file),
      quit: () => app.quit(),
      reportError: async (message) => {
        const win = await window()
        const options: Electron.MessageBoxOptions = {
          type: 'error',
          title: i18next.t('update.failedTitle'),
          message: i18next.t('update.failedTitle'),
          detail: message
        }
        if (win) await dialog.showMessageBox(win, options)
        else await dialog.showMessageBox(options)
      },
      log: { info: (m) => logger.info(m), warn: (m, e) => logger.warn(m, e) }
    })
  }
  return updater
}

/** 登录状态就绪后调用：每次启动只检查一次；开发环境与非 Windows 不检查。 */
export function scheduleUpdateCheck(): void {
  if (scheduled || !app.isPackaged || process.platform !== 'win32') return
  scheduled = true
  setTimeout(() => void nexoUpdater().checkOnce(), CHECK_DELAY_MS)
}

/** 设置页“检查更新”按钮。开发环境照样检查（便于验证），但不会自动弹出。 */
export async function nexoCheckForUpdate(): Promise<UpdateCheckResult> {
  return await nexoUpdater().checkManually()
}
