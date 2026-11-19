import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LeaveRequestForm from '@/components/requests/LeaveRequestForm.vue'
import { seedMinions } from '@/data/seedMinions'

// The form reads today's date when it is created. Faking only `Date` pins "today" to
// 19 November 2026 without touching timers or Vue's internals.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 19, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function mountForm(preselectedMinionId?: string) {
  return mount(LeaveRequestForm, { props: { minions: seedMinions, preselectedMinionId } })
}

function errors(wrapper: ReturnType<typeof mountForm>): string[] {
  return wrapper.findAll('p.text-blood-300').map((p) => p.text())
}

describe('LeaveRequestForm', () => {
  it('pre-selects the applicant from the prop', () => {
    const wrapper = mountForm('m-006')
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('m-006')
  })

  it('follows the prop when it changes while the form stays open', async () => {
    const wrapper = mountForm('m-006')
    await wrapper.setProps({ preselectedMinionId: 'm-012' })
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('m-012')
  })

  it('shows only the fields of the selected request type', async () => {
    const wrapper = mountForm()
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2) // vacation: first and last day

    await wrapper.find('input[value="full-moon-leave"]').setValue(true)

    expect(wrapper.findAll('input[type="date"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('The next full moon is on 24 Nov 2026.')
  })

  it('refuses full-moon leave for non-werewolves', async () => {
    const wrapper = mountForm('m-001') // Grizzle, a goblin
    await wrapper.find('input[value="full-moon-leave"]').setValue(true)
    await wrapper.find('input[type="date"]').setValue('2026-11-24')
    await wrapper.find('form').trigger('submit')

    expect(errors(wrapper)).toContain('Only werewolves can request full-moon leave.')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('emits a draft with exactly the fields of its type', async () => {
    const wrapper = mountForm('m-006') // Fenric, a werewolf
    await wrapper.find('input[value="full-moon-leave"]').setValue(true)
    const useNextFullMoon = wrapper.findAll('button').find((b) => b.text().startsWith('Use'))!
    await useNextFullMoon.trigger('click')
    await wrapper.find('textarea').setValue('  Family tradition.  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          type: 'full-moon-leave',
          minionId: 'm-006',
          note: 'Family tradition.',
          fullMoonDate: '2026-11-24',
        },
      ],
    ])
  })
})
