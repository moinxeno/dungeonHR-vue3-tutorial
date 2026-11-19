import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MinionForm from '@/components/minions/MinionForm.vue'

function mountForm(existingNames: string[] = []) {
  // `attachTo` puts the component into the real document, which focus behavior needs.
  return mount(MinionForm, { props: { existingNames }, attachTo: document.body })
}

describe('MinionForm', () => {
  it('focuses the name field when it opens', () => {
    const wrapper = mountForm()
    expect(document.activeElement).toBe(wrapper.find('input[type="text"]').element)
    wrapper.unmount()
  })

  it('shows errors only after the first submit, and emits nothing while invalid', async () => {
    const wrapper = mountForm()
    expect(wrapper.text()).not.toContain('Every minion needs a name.')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Every minion needs a name.')
    expect(wrapper.find('input[type="text"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('updates errors live once they are visible', async () => {
    const wrapper = mountForm()
    await wrapper.find('form').trigger('submit')

    await wrapper.find('input[type="text"]').setValue('Nibbles')

    expect(wrapper.text()).not.toContain('Every minion needs a name.')
    wrapper.unmount()
  })

  it('rejects names that are already taken', async () => {
    const wrapper = mountForm(['Grizzle Snaggletooth'])
    await wrapper.find('input[type="text"]').setValue('grizzle snaggletooth')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('A minion with this name already works here.')
    wrapper.unmount()
  })

  it('pre-fills HP and salary from the chosen species', async () => {
    const wrapper = mountForm()
    await wrapper.find('select').setValue('beholder')

    const [maxHp, salary] = wrapper.findAll('input[type="number"]')
    expect((maxHp!.element as HTMLInputElement).value).toBe('190')
    expect((salary!.element as HTMLInputElement).value).toBe('1400')
    wrapper.unmount()
  })

  it('emits a tidy draft and resets itself', async () => {
    const wrapper = mountForm()
    await wrapper.find('input[type="text"]').setValue('  Nibbles  ')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          name: 'Nibbles',
          species: 'goblin',
          maxHp: 22,
          threatLevel: 1,
          salary: 100,
          isUnionized: true,
          // No `bio`: an empty bio is left out rather than stored as ''.
        },
      ],
    ])
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('lets the parent decide what cancel means', async () => {
    const wrapper = mountForm()
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancel')!
    await cancel.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
