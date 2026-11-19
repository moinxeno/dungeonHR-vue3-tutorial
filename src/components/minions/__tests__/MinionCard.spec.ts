import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { makeMinion } from '@/__tests__/factories'
import MinionCard from '@/components/minions/MinionCard.vue'
import type { Minion } from '@/types/dungeon'

function mountCard(overrides: Partial<Minion> = {}) {
  const minion = makeMinion({ name: 'Snikkit Two-Knives', hp: 10, maxHp: 20, ...overrides })
  const wrapper = mount(MinionCard, {
    props: { minion },
    // The card links to the profile page. A stub renders the link without needing a real router,
    // and remembers the `to` prop so we can check it.
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  return { wrapper, minion }
}

/** Finds a button by its visible text, the way a user would. */
function button(wrapper: ReturnType<typeof mountCard>['wrapper'], text: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!match) throw new Error(`No button with text "${text}"`)
  return match
}

describe('MinionCard', () => {
  it('shows the minion and links to the profile', () => {
    const { wrapper, minion } = mountCard({ salary: 1500 })

    expect(wrapper.text()).toContain('Snikkit Two-Knives')
    expect(wrapper.text()).toContain('1,500 gp / month')
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'minion',
      params: { id: minion.id },
    })
  })

  it('marks union members and knocked-out minions', () => {
    const { wrapper } = mountCard({ isUnionized: true, hp: 0 })
    expect(wrapper.text()).toContain('Union')
    expect(wrapper.text()).toContain('Knocked out')
  })

  it('asks its parent to heal the minion', async () => {
    const { wrapper, minion } = mountCard()
    await button(wrapper, 'Heal').trigger('click')
    // The card does not heal anyone itself. It only reports the request.
    expect(wrapper.emitted('heal')).toEqual([[minion.id]])
  })

  it('disables actions that make no sense', () => {
    expect(button(mountCard({ hp: 20 }).wrapper, 'Heal').attributes('disabled')).toBeDefined()
    expect(
      button(mountCard({ hp: 0, stress: 50 }).wrapper, 'Send to rest').attributes('disabled'),
    ).toBeDefined()
    expect(
      button(mountCard({ stress: 0 }).wrapper, 'Send to rest').attributes('disabled'),
    ).toBeDefined()
  })

  it('asks for confirmation before firing', async () => {
    const { wrapper, minion } = mountCard()

    await button(wrapper, 'Fire').trigger('click')
    expect(wrapper.emitted('fire')).toBeUndefined()
    expect(wrapper.text()).toContain('Fire Snikkit Two-Knives?')

    await button(wrapper, 'Yes, fire').trigger('click')
    expect(wrapper.emitted('fire')).toEqual([[minion.id]])
  })

  it('can cancel firing', async () => {
    const { wrapper } = mountCard()
    await button(wrapper, 'Fire').trigger('click')
    await button(wrapper, 'Cancel').trigger('click')

    expect(wrapper.emitted('fire')).toBeUndefined()
    expect(wrapper.text()).toContain('Heal')
  })

  it('offers no way to fire union members', () => {
    const { wrapper } = mountCard({ isUnionized: true })
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Fire')
    expect(wrapper.text()).toContain('Firing needs a union hearing')
  })
})
