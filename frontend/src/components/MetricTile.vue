<template>
  <Card class="metric-tile">
    <template #content>
      <div class="metric-content">
        <span class="metric-icon" :class="tone"><i :class="icon" /></span>
        <div class="metric-copy">
          <span>{{ label }}</span>
          <strong>{{ value }}</strong>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup>
import Card from 'primevue/card'

defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: 0 },
  icon: { type: String, default: 'pi pi-chart-bar' },
  tone: { type: String, default: 'emerald' }
})
</script>
