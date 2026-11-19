import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { makeMinionDraft } from '@/__tests__/factories'
import { REST_STRESS_RELIEF, useDungeonStore } from '@/stores/dungeon'

// Seed minions used below:
// m-001 Grizzle   goblin,  threat 2, union,     stress 35, posted to Torture Chamber 3 (dawn)
// m-007 Snikkit   goblin,  threat 1, non-union, stress 81, unassigned
// m-009 Urzula    orc,     threat 3, non-union, posted to the Gatehouse (dusk)
// m-011 Hrothgar  minotaur, threat 4, posted to the Gatehouse (midnight), next to m-004

beforeEach(() => {
  // A fresh Pinia and empty storage for every test, so no test sees another test's changes.
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dungeon store', () => {
  it('starts from the seed data', () => {
    const dungeon = useDungeonStore()
    expect(dungeon.minions).toHaveLength(12)
    expect(dungeon.assignments).toHaveLength(11)
    expect(dungeon.unassignedMinions.map((minion) => minion.id)).toEqual(['m-007'])
  })

  it('recruits a minion at full health and without stress', () => {
    const dungeon = useDungeonStore()
    dungeon.recruitMinion(makeMinionDraft({ name: 'Nibbles', maxHp: 30 }))

    expect(dungeon.minions[0]).toMatchObject({ name: 'Nibbles', hp: 30, maxHp: 30, stress: 0 })
    expect(dungeon.minions).toHaveLength(13)
  })

  describe('resting', () => {
    it(`removes ${REST_STRESS_RELIEF} stress`, () => {
      const dungeon = useDungeonStore()
      dungeon.restMinion('m-007')
      expect(dungeon.getMinion('m-007')?.stress).toBe(81 - REST_STRESS_RELIEF)
    })

    it('never goes below zero', () => {
      const dungeon = useDungeonStore()
      dungeon.relieveStress('m-001', 1000)
      expect(dungeon.getMinion('m-001')?.stress).toBe(0)
    })

    it('is not possible while knocked out', () => {
      const dungeon = useDungeonStore()
      dungeon.getMinion('m-007')!.hp = 0
      dungeon.restMinion('m-007')
      expect(dungeon.getMinion('m-007')?.stress).toBe(81)
    })
  })

  describe('firing', () => {
    it('refuses to fire union members', () => {
      const dungeon = useDungeonStore()
      const result = dungeon.fireMinion('m-001')
      expect(result).toEqual({
        ok: false,
        reason: 'Grizzle Snaggletooth is a union member. Firing needs a hearing.',
      })
      expect(dungeon.getMinion('m-001')).toBeDefined()
    })

    it('removes the minion and their assignment', () => {
      const dungeon = useDungeonStore()
      expect(dungeon.fireMinion('m-009')).toEqual({ ok: true })
      expect(dungeon.getMinion('m-009')).toBeUndefined()
      expect(dungeon.getAssignment('m-009')).toBeUndefined()
    })
  })

  describe('assignments', () => {
    it('refuses minions below the sector minimum threat level', () => {
      const dungeon = useDungeonStore()
      const result = dungeon.assignMinion('m-007', 's-treasury', 'dawn')
      expect(result.ok).toBe(false)
      expect(dungeon.getAssignment('m-007')).toBeUndefined()
    })

    it('moves a minion who already has a post', () => {
      const dungeon = useDungeonStore()
      dungeon.assignMinion('m-011', 's-treasury', 'dusk')

      expect(dungeon.getAssignment('m-011')).toEqual({
        minionId: 'm-011',
        sectorId: 's-treasury',
        shift: 'dusk',
      })
      expect(dungeon.assignments.filter((a) => a.minionId === 'm-011')).toHaveLength(1)
      expect(dungeon.getCrew('s-gatehouse', 'midnight').map((m) => m.id)).toEqual(['m-004'])
    })

    it('clears the related alerts', () => {
      const dungeon = useDungeonStore()
      const before = dungeon.alerts.length

      dungeon.unassignMinion('m-011') // the second minotaur leaves the gatehouse

      // Both the minotaur clash and the gatehouse's budget overrun disappear.
      expect(dungeon.alerts).toHaveLength(before - 2)
    })
  })

  describe('raids', () => {
    it('spares knocked-out minions', () => {
      // Make the raid predictable: Math.random() is always just below 1, so every hit is maximal.
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const dungeon = useDungeonStore()
      const snikkit = dungeon.getMinion('m-007')!
      snikkit.hp = 0

      dungeon.simulateRaid()

      expect(snikkit.stress).toBe(81)
      expect(dungeon.getMinion('m-001')!.stress).toBeGreaterThan(35)
    })

    it('can be undone by the healer, except for the stress', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const dungeon = useDungeonStore()
      dungeon.simulateRaid()
      dungeon.callHealer()

      expect(dungeon.woundedCount).toBe(0)
      expect(dungeon.getMinion('m-001')!.stress).toBeGreaterThan(35)
    })
  })

  describe('persistence', () => {
    it('survives a restart of the app', async () => {
      const dungeon = useDungeonStore()
      dungeon.recruitMinion(makeMinionDraft({ name: 'Persistent Pete' }))
      await nextTick() // let useLocalStorage's watcher save

      // A new Pinia is what a page reload gives you: brand-new stores.
      setActivePinia(createPinia())
      const reloaded = useDungeonStore()

      expect(reloaded.minions[0]?.name).toBe('Persistent Pete')
    })

    it('can be reset to the seed data', async () => {
      const dungeon = useDungeonStore()
      dungeon.fireMinion('m-009')
      dungeon.resetToSeed()
      await nextTick()

      expect(dungeon.getMinion('m-009')).toBeDefined()
      expect(dungeon.assignments).toHaveLength(11)
    })
  })
})
