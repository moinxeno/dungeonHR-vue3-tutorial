<script setup lang="ts">
import { ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import { useDungeonStore } from '@/stores/dungeon'
import { useRequestsStore } from '@/stores/requests'

const dungeon = useDungeonStore()
const requests = useRequestsStore()

const isConfirmingReset = ref(false)

function resetDemoData(): void {
  dungeon.resetToSeed()
  requests.resetToSeed()
  isConfirmingReset.value = false
}
</script>

<template>
  <footer class="mt-16 border-t border-crypt-800">
    <div
      class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-crypt-500 sm:px-6 lg:px-8"
    >
      <p>Changes are saved in this browser. DungeonHR is an open-source Vue 3 tutorial.</p>

      <div v-if="isConfirmingReset" class="flex flex-wrap items-center gap-2">
        <span class="text-blood-300">Restore the original roster, assignments and requests?</span>
        <BaseButton size="sm" variant="danger" @click="resetDemoData">Reset</BaseButton>
        <BaseButton size="sm" variant="ghost" @click="isConfirmingReset = false">Cancel</BaseButton>
      </div>
      <BaseButton v-else size="sm" variant="ghost" @click="isConfirmingReset = true">
        Reset demo data
      </BaseButton>
    </div>
  </footer>
</template>
