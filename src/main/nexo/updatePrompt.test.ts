import { describe, expect, it } from 'vitest'
import type { UpdatePromptState } from '../../shared/update'
import { UpdatePrompt } from './updatePrompt'

const update = { version: '1.0.5', notes: '修复', file: 'a.exe', url: 'https://x/a.exe' }

function setup(): { prompt: UpdatePrompt; states: UpdatePromptState[] } {
  const states: UpdatePromptState[] = []
  return { prompt: new UpdatePrompt('1.0.4', (s) => states.push(s)), states }
}

describe('UpdatePrompt', () => {
  it('resolves true and moves to downloading when the user accepts', async () => {
    const { prompt, states } = setup()
    const answer = prompt.confirm(update as never)
    expect(prompt.getState()).toEqual({
      phase: 'available',
      version: '1.0.5',
      current: '1.0.4',
      notes: '修复'
    })
    prompt.respond(true)
    await expect(answer).resolves.toBe(true)
    expect(prompt.getState()).toMatchObject({ phase: 'downloading', progress: 0 })
    prompt.progress(0.004)
    prompt.progress(0.5)
    prompt.progress(1)
    expect(states.map((s) => (s.phase === 'downloading' ? s.progress : s.phase))).toEqual([
      'available',
      0,
      0.5,
      1
    ])
  })

  it('resolves false and closes when the user picks later', async () => {
    const { prompt } = setup()
    const answer = prompt.confirm(update as never)
    prompt.respond(false)
    await expect(answer).resolves.toBe(false)
    expect(prompt.getState()).toEqual({ phase: 'idle' })
  })

  it('shows errors in the modal and closes on dismiss', () => {
    const { prompt } = setup()
    void prompt.confirm(update as never)
    prompt.respond(true)
    prompt.error('sha256 mismatch')
    expect(prompt.getState()).toMatchObject({ phase: 'error', message: 'sha256 mismatch' })
    prompt.dismiss()
    expect(prompt.getState()).toEqual({ phase: 'idle' })
  })

  it('ignores stray answers and errors while idle', () => {
    const { prompt, states } = setup()
    prompt.respond(true)
    prompt.error('x')
    prompt.progress(0.5)
    expect(states).toEqual([])
  })
})
