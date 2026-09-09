<template>
  <div class="page-stack">
    <div class="metric-grid">
      <MetricTile label="Active Employees" :value="stats.employees ?? 0" icon="pi pi-users" tone="emerald" />
      <MetricTile label="Local Staff" :value="stats.localEmployees ?? 0" icon="pi pi-id-card" tone="blue" />
      <MetricTile label="Foreigners" :value="stats.foreignEmployees ?? 0" icon="pi pi-globe" tone="violet" />
      <MetricTile label="Full Releases" :value="stats.fullReleases ?? 0" icon="pi pi-check-circle" tone="emerald" />
      <MetricTile label="Corrections" :value="stats.correctionReleases ?? 0" icon="pi pi-refresh" tone="amber" />
      <MetricTile label="Delivered" :value="stats.sent ?? 0" icon="pi pi-send" tone="blue" />
      <MetricTile label="Failed" :value="stats.failed ?? 0" icon="pi pi-exclamation-circle" tone="rose" />
    </div>

    <div class="surface-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">Quick Actions</span>
        </div>
      </div>
      <div class="surface-body quick-grid">
        <Button label="Add Employee" icon="pi pi-user-plus" severity="secondary" outlined @click="$router.push('/employees')" />
        <Button label="Import Payroll" icon="pi pi-file-import" severity="secondary" outlined @click="$router.push('/payroll/import')" />
        <Button label="Payroll Releases" icon="pi pi-history" severity="secondary" outlined @click="$router.push('/payroll/releases')" />
        <Button label="Payslip Designer" icon="pi pi-palette" severity="secondary" outlined @click="$router.push('/payslip-designer')" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import MetricTile from '../components/MetricTile.vue'
import { api } from '../api/client.js'

const stats = ref({})

onMounted(async () => {
  const { data } = await api.get('/dashboard')
  stats.value = data
})
</script>

<style scoped>
.quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
@media (max-width: 950px) { .quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .quick-grid { grid-template-columns: 1fr; } }
</style>
