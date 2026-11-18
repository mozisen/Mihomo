// Windows：只在第一次提权时弹一次 UAC，之后每次启动都自动以管理员身份运行。
//
// 原理：以管理员身份运行时，在任务计划程序里建一个“最高权限、仅手动触发”的任务；
// 之后普通权限启动时（双击快捷方式、安装器拉起、更新后重启），在抢单实例锁之前
// 用 `schtasks /run` 交给这个任务以管理员身份重新启动，自己立即退出。
// 运行已存在的计划任务不会触发 UAC。
import { execFile, execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

export const ELEVATED_TASK_NAME = 'nexo-elevated'
/** 由计划任务拉起的进程带这个参数：即使仍未提权（标准用户）也不再转交，避免死循环 */
export const ELEVATED_FLAG = '--nexo-elevated'
/** 记录任务对应的 exe 路径：安装目录变了就不再转交（任务会指向旧路径） */
export const ELEVATED_MARKER = 'elevated-task.json'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildElevatedTaskXml(exe: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start nexo with administrator privileges without a UAC prompt.</Description>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"${xmlEscape(exe)}"</Command>
      <Arguments>${ELEVATED_FLAG}</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

export interface RelaunchInput {
  platform: string
  packaged: boolean
  /** 同步检测结果：true 已提权，null 未知/未提权 */
  elevated: boolean | null
  argv: string[]
  exe: string
  /** 标记文件中记录的 exe 路径，没有任务时为 undefined */
  taskExe?: string
}

/** 是否应交给计划任务以管理员身份重新启动 */
export function shouldRelaunchElevated(input: RelaunchInput): boolean {
  if (input.platform !== 'win32' || !input.packaged) return false
  if (input.elevated === true) return false
  const args = input.argv.slice(1)
  if (args.includes(ELEVATED_FLAG)) return false
  // 计划任务无法转交命令行参数：带深度链接等参数启动时保持原样
  if (args.some((a) => /^[a-z][a-z0-9+.-]*:\/\//i.test(a))) return false
  if (!input.taskExe) return false
  return (
    path.win32.normalize(input.taskExe).toLowerCase() ===
    path.win32.normalize(input.exe).toLowerCase()
  )
}

export function readTaskExe(dataDir: string): string | undefined {
  try {
    const file = path.join(dataDir, ELEVATED_MARKER)
    if (!existsSync(file)) return undefined
    const { exe } = JSON.parse(readFileSync(file, 'utf8')) as { exe?: unknown }
    return typeof exe === 'string' && exe ? exe : undefined
  } catch {
    return undefined
  }
}

/**
 * 普通权限启动时调用（必须在 requestSingleInstanceLock 之前）。
 * 成功转交返回 true，调用方应立即退出；任务不存在或运行失败返回 false，照常启动。
 */
export function relaunchElevatedSync(input: RelaunchInput): boolean {
  if (!shouldRelaunchElevated(input)) return false
  try {
    execFileSync(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'schtasks.exe'),
      ['/run', '/tn', ELEVATED_TASK_NAME],
      { stdio: 'ignore', windowsHide: true, timeout: 5000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * 以管理员身份运行时调用：创建/更新计划任务并写标记文件。此时已提权，不会弹 UAC。
 */
export async function ensureElevatedTask(
  exe: string,
  dataDir: string,
  log?: { info: (m: string) => void; warn: (m: string, e?: unknown) => void }
): Promise<void> {
  if (process.platform !== 'win32') return
  const schtasks = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'schtasks.exe')
  if (readTaskExe(dataDir) === exe) {
    // 标记还在但任务可能已被卸载程序删除：确认任务存在再跳过
    const exists = await promisify(execFile)(schtasks, ['/query', '/tn', ELEVATED_TASK_NAME], {
      windowsHide: true,
      timeout: 10000
    }).then(
      () => true,
      () => false
    )
    if (exists) return
  }
  const xmlFile = path.join(tmpdir(), `${ELEVATED_TASK_NAME}.xml`)
  try {
    writeFileSync(xmlFile, Buffer.from(`\ufeff${buildElevatedTaskXml(exe)}`, 'utf16le'))
    await promisify(execFile)(
      schtasks,
      ['/create', '/tn', ELEVATED_TASK_NAME, '/xml', xmlFile, '/f'],
      { windowsHide: true, timeout: 15000 }
    )
    writeFileSync(path.join(dataDir, ELEVATED_MARKER), JSON.stringify({ exe }))
    log?.info(`Elevated launch task registered for ${exe}`)
  } catch (e) {
    log?.warn('Failed to register elevated launch task', e)
  }
}
