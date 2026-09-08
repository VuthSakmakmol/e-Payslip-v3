<template>
  <div class="page-stack">
    <div class="surface-panel app-toolbar design-list-toolbar">
      <div class="toolbar-left">
        <IconField class="icon-search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Search design" />
        </IconField>
      </div>
      <div class="toolbar-right">
        <Button label="Blank" icon="pi pi-file" severity="secondary" outlined @click="createBlank" />
        <Button label="New Design" icon="pi pi-plus" @click="createDefault" />
      </div>
    </div>

    <div class="surface-panel design-list-panel">
      <DataTable
        :value="filteredDesigns"
        dataKey="_id"
        class="app-table design-table"
        :loading="loading"
        responsiveLayout="scroll"
      >
        <Column header="Design" style="min-width:280px">
          <template #body="{ data }">
            <div class="design-name-cell">
              <div class="design-page-icon" :class="`is-${data.pageOrientation}`">
                <span></span><span></span><span></span>
              </div>
              <div class="identity-copy">
                <strong>{{ data.name }}</strong>
                <span>{{ data.elements?.length || 0 }} elements</span>
              </div>
            </div>
          </template>
        </Column>
        <Column header="Page" style="width:150px">
          <template #body="{ data }">
            <div class="stack-cell">
              <strong>A4</strong>
              <span>{{ orientationLabel(data.pageOrientation) }}</span>
            </div>
          </template>
        </Column>
        <Column header="Updated" style="width:190px">
          <template #body="{ data }">
            <span class="table-date">{{ formatDate(data.updatedAt) }}</span>
          </template>
        </Column>
        <Column header="Use" style="width:130px">
          <template #body="{ data }">
            <Tag v-if="data.active" value="In Use" icon="pi pi-check" severity="success" />
            <Button
              v-else
              label="Use"
              icon="pi pi-check-circle"
              size="small"
              severity="secondary"
              outlined
              :loading="activatingId === data._id"
              @click="activateDesign(data)"
            />
          </template>
        </Column>
        <Column header="Actions" style="width:170px">
          <template #body="{ data }">
            <div class="row-actions">
              <Button icon="pi pi-pencil" text rounded v-tooltip.top="'Edit'" @click="editDesign(data)" />
              <Button icon="pi pi-copy" text rounded severity="secondary" v-tooltip.top="'Duplicate'" @click="duplicateDesign(data)" />
              <Button icon="pi pi-trash" text rounded severity="danger" :disabled="data.active" v-tooltip.top="data.active ? 'Design in use cannot be deleted' : 'Delete'" @click="removeDesign(data)" />
            </div>
          </template>
        </Column>
        <template #empty>
          <div class="empty-state design-empty">
            <i class="pi pi-palette" />
            <strong>No payslip designs</strong>
            <Button label="Create Default" size="small" @click="createDefault" />
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { api } from '../api/client.js'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const designs = ref([])
const search = ref('')
const loading = ref(false)
const activatingId = ref('')

const filteredDesigns = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return designs.value
  return designs.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

function orientationLabel(value) {
  return value === 'portrait' ? 'Portrait' : 'Landscape'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/payslips/designs')
    designs.value = data.items || []
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot load designs', detail: error.response?.data?.message || error.message, life: 4500 })
  } finally {
    loading.value = false
  }
}

function createBlank() {
  router.push({ name: 'payslip-design-new' })
}

function createDefault() {
  router.push({ name: 'payslip-design-new', query: { template: 'default' } })
}

function editDesign(item) {
  router.push({ name: 'payslip-design-edit', params: { id: item._id } })
}

async function activateDesign(item) {
  activatingId.value = item._id
  try {
    await api.post(`/payslips/designs/${item._id}/activate`)
    await load()
    toast.add({ severity: 'success', summary: 'Payslip design is now in use', life: 2200 })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot activate design', detail: error.response?.data?.message || error.message, life: 4500 })
  } finally {
    activatingId.value = ''
  }
}

async function duplicateDesign(item) {
  try {
    const { data } = await api.post(`/payslips/designs/${item._id}/duplicate`)
    await load()
    toast.add({ severity: 'success', summary: 'Design duplicated', life: 1800 })
    editDesign(data)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot duplicate design', detail: error.response?.data?.message || error.message, life: 4500 })
  }
}

function removeDesign(item) {
  confirm.require({
    header: 'Delete Design',
    message: item.name,
    icon: 'pi pi-trash',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.delete(`/payslips/designs/${item._id}`)
        await load()
        toast.add({ severity: 'success', summary: 'Design deleted', life: 1800 })
      } catch (error) {
        toast.add({ severity: 'error', summary: 'Cannot delete design', detail: error.response?.data?.message || error.message, life: 4500 })
      }
    }
  })
}

onMounted(load)
</script>
