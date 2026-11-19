import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDungeonStore } from '@/stores/dungeon'
import MinionDetailView from '@/views/MinionDetailView.vue'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function mountView(id: string) {
  // The view reads the active Pinia set up in beforeEach. Only the router links are stubbed.
  return mount(MinionDetailView, {
    props: { id },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MinionDetailView', () => {
  it('shows the minion from the store, including their post', () => {
    const wrapper = mountView('m-001')

    expect(wrapper.find('h1').text()).toBe('Grizzle Snaggletooth')
    expect(wrapper.text()).toContain('Torture Chamber 3, dawn shift')
  })

  it('shows live data, not the seed data', async () => {
    const dungeon = useDungeonStore()
    const wrapper = mountView('m-001')

    dungeon.getMinion('m-001')!.hp = 0
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Knocked out')
  })

  // Regression test for chapter 4's lesson: going from one profile to the next only changes the
  // `id` prop. The router reuses the component, so everything must be derived from `id`.
  it('follows a changing id without being re-created', async () => {
    const wrapper = mountView('m-001')
    await wrapper.setProps({ id: 'm-002' })

    expect(wrapper.find('h1').text()).toBe('Rattlebones McGee')
  })

  it('explains when there is no such minion', () => {
    const wrapper = mountView('m-999')
    expect(wrapper.find('h1').text()).toBe('No such minion')
    expect(wrapper.text()).toContain('m-999')
  })
})
