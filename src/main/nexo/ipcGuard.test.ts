import { describe, expect, it } from 'vitest'
import { NexoProtectedError, guardNexoHandlers, redactRuntimeConfig } from './ipcGuard'

const runtime = {
  proxies: [{ name: 'hk', type: 'ss', server: '1.2.3.4', password: 'p' }],
  'proxy-groups': [{ name: 'auto', type: 'url-test', proxies: ['hk'] }],
  'proxy-providers': { airport: { type: 'http', url: 'https://x/sub?token=t', path: './p.yaml' } },
  'rule-providers': { ads: { type: 'http', behavior: 'domain', path: './ads.yaml' } }
} as unknown as IMihomoConfig

function setup(active: boolean) {
  const calls: string[] = []
  const handlers = guardNexoHandlers(
    {
      getProfileStr: async (id: string) => (calls.push(`get ${id}`), 'content'),
      setProfileStr: async (id: string) => void calls.push(`set ${id}`),
      updateProfileItem: async (item: IProfileItem) => void calls.push(`update ${item.id}`),
      removeProfileItem: async (id: string) => void calls.push(`remove ${id}`),
      getRuntimeConfigStr: async () => 'proxies: [...]',
      getRuntimeConfig: async () => runtime,
      getFileStr: async (p: string) => `file ${p}`,
      mihomoVersion: async () => 'v1'
    },
    {
      profileId: 'nexo',
      isNexoActive: async () => active,
      isProtectedFile: async (p) => p === 'config.yaml'
    }
  )
  return { handlers, calls }
}

describe('guardNexoHandlers', () => {
  it('blocks reading and editing the NEXO profile', async () => {
    const { handlers, calls } = setup(true)
    await expect(handlers.getProfileStr('nexo')).rejects.toBeInstanceOf(NexoProtectedError)
    await expect(handlers.setProfileStr('nexo')).rejects.toBeInstanceOf(NexoProtectedError)
    await expect(
      handlers.updateProfileItem({ id: 'nexo', type: 'local', name: 'x' })
    ).rejects.toBeInstanceOf(NexoProtectedError)
    await expect(handlers.removeProfileItem('nexo')).rejects.toBeInstanceOf(NexoProtectedError)
    expect(calls).toEqual([])
  })

  it('leaves other profiles alone', async () => {
    const { handlers } = setup(true)
    await expect(handlers.getProfileStr('other')).resolves.toBe('content')
    await expect(handlers.mihomoVersion()).resolves.toBe('v1')
  })

  it('hides the runtime config while the NEXO profile is active', async () => {
    const { handlers } = setup(true)
    await expect(handlers.getRuntimeConfigStr()).rejects.toBeInstanceOf(NexoProtectedError)
    await expect(handlers.getFileStr('config.yaml')).rejects.toBeInstanceOf(NexoProtectedError)
    await expect(handlers.getFileStr('./ads.yaml')).resolves.toBe('file ./ads.yaml')
    const redacted = await handlers.getRuntimeConfig()
    expect(redacted).toEqual(redactRuntimeConfig(runtime))
    expect(JSON.stringify(redacted)).not.toMatch(/1\.2\.3\.4|token=t|password/)
  })

  it('returns the full runtime config for other profiles', async () => {
    const { handlers } = setup(false)
    await expect(handlers.getRuntimeConfigStr()).resolves.toContain('proxies')
    await expect(handlers.getRuntimeConfig()).resolves.toBe(runtime)
  })
})

describe('redactRuntimeConfig', () => {
  it('keeps rule providers and only proxy provider types', () => {
    expect(redactRuntimeConfig(runtime)).toEqual({
      'rule-providers': runtime['rule-providers'],
      'proxy-providers': { airport: { type: 'http' } }
    })
  })
})
