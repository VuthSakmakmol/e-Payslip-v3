<template>
  <div class="surface-panel">
    <div class="app-toolbar">
      <div class="toolbar-left">
        <Select v-model="staffCategory" :options="categories" optionLabel="label" optionValue="value" placeholder="All categories" showClear class="compact-filter" @change="load(1)" />
        <Select v-model="releaseMode" :options="releaseModes" optionLabel="label" optionValue="value" placeholder="All release types" showClear class="compact-filter" @change="load(1)" />
        <Button icon="pi pi-refresh" severity="secondary" text rounded v-tooltip.top="'Refresh'" @click="load(page)" />
      </div>
      <div class="toolbar-right">
        <Tag value="Audit Only · No Payroll Stored" severity="info" />
        <Button label="Import Payroll" icon="pi pi-plus" @click="$router.push('/payroll/import')" />
      </div>
    </div>

    <DataTable
      :value="items"
      :loading="loading"
      lazy
      paginator
      :rows="10"
      :totalRecords="total"
      :first="(page - 1) * 10"
      @page="onPage"
      size="small"
      class="app-table"
      dataKey="_id"
    >
      <template #empty><div class="empty-state"><i class="pi pi-history" /><strong>No payroll release history</strong></div></template>
      <Column header="Period" style="min-width: 190px">
        <template #body="{ data }">
          <div class="stack-cell">
            <strong>{{ monthName(data.month) }} {{ data.year }}</strong>
            <span>{{ data.staffCategory === 'LOCAL' ? (data.payPeriodId?.name || 'Local Staff') : 'Foreigner' }}</span>
          </div>
        </template>
      </Column>
      <Column header="Category" style="width: 130px">
        <template #body="{ data }"><Tag :value="data.staffCategory === 'LOCAL' ? 'Local Staff' : 'Foreigner'" severity="secondary" /></template>
      </Column>
      <Column header="Release" style="min-width: 140px">
        <template #body="{ data }"><Tag :value="releaseLabel(data)" :severity="data.releaseMode === 'UPDATE' ? 'warn' : 'info'" /></template>
      </Column>
      <Column header="Employees" field="employeeCount" style="width: 110px" />
      <Column header="Sent" style="width: 90px"><template #body="{ data }"><span class="success-count">{{ data.sentCount || 0 }}</span></template></Column>
      <Column header="Failed" style="width: 90px"><template #body="{ data }"><span :class="{ 'danger-count': data.failedCount > 0 }">{{ data.failedCount || 0 }}</span></template></Column>
      <Column header="Released" style="min-width: 180px"><template #body="{ data }">{{ formatDateTime(data.releasedAt) }}</template></Column>
      <Column header="Source File" field="sourceFileName" style="min-width: 220px" />
    </DataTable>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { api } from '../api/client.js'

const items = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const staffCategory = ref(null)
const releaseMode = ref(null)

const categories = [
  { label: 'Local Staff', value: 'LOCAL' },
  { label: 'Foreigner', value: 'FOREIGNER' }
]
const releaseModes = [
  { label: 'Full Payroll', value: 'FULL' },
  { label: 'Update / Correction', value: 'UPDATE' }
]

const monthName = (m) => new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2020, m - 1, 1))
function releaseLabel(item) {
  return item.releaseMode === 'UPDATE' ? `Update #${item.correctionNumber || 1}` : 'Full Payroll'
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
async function load(p = page.value) {
  loading.value = true
  try {
    page.value = p
    const { data } = await api.get('/payroll/releases', {
      params: {
        page: p,
        limit: 10,
        ...(staffCategory.value ? { staffCategory: staffCategory.value } : {}),
        ...(releaseMode.value ? { releaseMode: releaseMode.value } : {})
      }
    })
    items.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}
function onPage(e) { load(e.page + 1) }
onMounted(() => load())
</script>

<style scoped>
.compact-filter { width: 170px; }
.success-count { color: #0f8a63; font-weight: 700; }
.danger-count { color: #c2413b; font-weight: 700; }
</style>
