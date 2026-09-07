<template>
  <div class="page-stack">
    <div class="metric-grid employee-metrics">
      <MetricTile label="Employees" :value="summary.totalEmployees" icon="pi pi-users" tone="blue" />
      <MetricTile label="Active" :value="summary.activeEmployees" icon="pi pi-check-circle" tone="emerald" />
      <MetricTile label="Telegram Linked" :value="summary.telegramLinked" icon="pi pi-send" tone="blue" />
      <MetricTile label="Waiting Verification" :value="summary.firstLogin" icon="pi pi-key" tone="amber" />
    </div>

    <div class="surface-panel">
      <div class="app-toolbar">
        <div class="toolbar-left employee-filters">
          <IconField class="icon-search">
            <InputIcon class="pi pi-search" />
            <InputText v-model="search" placeholder="Search employees" class="w-full" @keyup.enter="load(1)" />
          </IconField>
          <Select v-model="categoryFilter" :options="categoryFilters" optionLabel="label" optionValue="value"
            class="filter-select" @change="load(1)" />
          <Select v-model="deliveryFilter" :options="deliveryFilters" optionLabel="label" optionValue="value"
            class="filter-select" @change="load(1)" />
          <Button icon="pi pi-refresh" severity="secondary" text rounded v-tooltip.top="'Refresh'"
            @click="load(page)" />
        </div>

        <div class="toolbar-right">
          <Button label="Export" icon="pi pi-file-excel" severity="secondary" outlined :loading="exporting"
            v-tooltip.top="'Export Telegram verification passwords'" @click="exportCredentials" />
          <Button label="Add Employee" icon="pi pi-plus" @click="openCreate" />
        </div>
      </div>

      <DataTable :value="items" :loading="loading" lazy paginator :rows="10" :totalRecords="total"
        :first="(page - 1) * 10" @page="onPage" size="small" scrollable class="app-table" dataKey="_id">
        <template #empty>
          <div class="empty-state">
            <i class="pi pi-users" />
            <strong>No employees</strong>
          </div>
        </template>

        <Column header="Employee" frozen style="min-width: 235px">
          <template #body="{ data }">
            <div class="identity-cell">
              <Avatar :label="initials(data.fullName)" shape="circle" size="normal" />
              <div class="identity-copy">
                <strong>{{ data.fullName }}</strong>
                <span>{{ data.employeeCode }}<template v-if="data.dateJoin"> · {{ formatDate(data.dateJoin)
                    }}</template></span>
              </div>
            </div>
          </template>
        </Column>

        <Column header="Organization" style="min-width: 230px">
          <template #body="{ data }">
            <div class="stack-cell">
              <strong>{{ data.department || '—' }}</strong>
              <span>{{ data.position || '—' }}</span>
            </div>
          </template>
        </Column>

        <Column header="Category" style="min-width: 130px">
          <template #body="{ data }">
            <div class="tag-stack">
              <Tag :value="data.staffCategory === 'FOREIGNER' ? 'Foreigner' : 'Local'"
                :severity="data.staffCategory === 'FOREIGNER' ? 'info' : 'success'" />
            </div>
          </template>
        </Column>

        <Column header="Delivery" style="min-width: 225px">
          <template #body="{ data }">
            <div v-if="data.preferredDelivery === 'EMAIL'" class="channel-line">
              <span class="channel-icon email"><i class="pi pi-envelope" /></span>
              <div class="stack-cell">
                <strong>{{ data.companyEmail || 'Company Email' }}</strong>
                <span>Email</span>
              </div>
            </div>

            <button v-else type="button" class="telegram-link" @click="openTelegramProfile(data)">
              <span class="channel-icon telegram"><i class="pi pi-send" /></span>
              <div class="stack-cell">
                <strong>{{ data.telegramSummary?.username ? `@${data.telegramSummary.username}` : 'Telegram' }}</strong>
                <span>{{ data.telegramVerified ? 'Verified' : 'Not linked' }}</span>
              </div>
              <i class="pi pi-angle-right" />
            </button>
          </template>
        </Column>

        <Column header="Credential" style="min-width: 145px">
          <template #body="{ data }">
            <code v-if="data.temporaryPassword" class="inline-code">{{ data.temporaryPassword }}</code>
            <Tag v-else-if="data.telegramVerified" value="Used" severity="success" />
            <Tag v-else-if="data.preferredDelivery === 'EMAIL'" value="Not required" severity="info" />
            <span v-else>—</span>
          </template>
        </Column>

        <Column header="Access" style="min-width: 125px">
          <template #body="{ data }">
            <Tag :value="accountLabel(data)" :severity="accountSeverity(data)" />
          </template>
        </Column>

        <Column header="Actions" frozen alignFrozen="right" style="width: 100px">
          <template #body="{ data }">
            <div class="row-actions">
              <Button icon="pi pi-pencil" severity="secondary" text rounded v-tooltip.top="'Edit'"
                @click="openEdit(data)" />
              <Button v-if="data.preferredDelivery === 'TELEGRAM'" icon="pi pi-key" severity="secondary" text rounded
                v-tooltip.top="'Reset Telegram verification password'" @click="confirmResetPassword(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>

  <Dialog v-model:visible="dialog" modal :header="form._id ? 'Edit Employee' : 'Add Employee'"
    :style="{ width: '760px', maxWidth: 'calc(100vw - 28px)' }" :breakpoints="{ '820px': '96vw' }">
    <div class="form-section">
      <div class="form-section-title"><i class="pi pi-user" /> Employee</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="required">Employee ID</label>
          <InputText v-model.trim="form.employeeCode" />
        </div>
        <div class="form-field">
          <label class="required">Full Name</label>
          <InputText v-model.trim="form.fullName" />
        </div>
        <div class="form-field">
          <label class="required">Date Join</label>
          <DatePicker v-model="form.dateJoin" dateFormat="dd/mm/yy" showIcon iconDisplay="input" />
        </div>
        <div class="form-field">
          <label class="required">Date of Birth</label>
          <DatePicker v-model="form.dateOfBirth" dateFormat="dd/mm/yy" showIcon iconDisplay="input" />
        </div>
        <div class="form-field">
          <label class="required">Category</label>
          <Select v-model="form.staffCategory" :options="categories" optionLabel="label" optionValue="value" />
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="pi pi-building" /> Organization</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="required">Department</label>
          <InputText v-model.trim="form.department" />
        </div>
        <div class="form-field">
          <label class="required">Position</label>
          <InputText v-model.trim="form.position" />
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title"><i class="pi pi-send" /> Delivery</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="required">Channel</label>
          <Select v-model="form.preferredDelivery" :options="deliveries" optionLabel="label" optionValue="value" />
        </div>
        <div v-if="form.preferredDelivery === 'EMAIL'" class="form-field">
          <label class="required">Company Email</label>
          <InputText v-model.trim="form.companyEmail" type="email" />
        </div>
        <div class="form-field">
          <label>Status</label>
          <div class="compact-switch">
            <ToggleSwitch v-model="form.active" />
            <span>{{ form.active ? 'Active' : 'Inactive' }}</span>
          </div>
        </div>
        <div class="form-field credential-mode">
          <label>Access</label>
          <Tag value="No Employee Portal" icon="pi pi-ban" severity="info" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="dialog = false" />
      <Button :label="form._id ? 'Save' : 'Create'" icon="pi pi-check" :loading="saving" @click="save" />
    </template>
  </Dialog>

  <Dialog v-model:visible="credentialDialog" modal :header="credentialDialogTitle" :closable="false"
    :style="{ width: '460px', maxWidth: 'calc(100vw - 28px)' }">
    <div class="credential-grid">
      <div>
        <span>Employee ID</span>
        <strong>{{ credentials.employeeCode }}</strong>
      </div>
      <div>
        <span>Telegram Verification Password</span>
        <code>{{ credentials.password }}</code>
      </div>
    </div>
    <template #footer>
      <Button label="Copy" icon="pi pi-copy" severity="secondary" outlined @click="copyCredentials" />
      <Button label="Done" @click="credentialDialog = false" />
    </template>
  </Dialog>

  <Drawer v-model:visible="telegramDialog" position="right" header="Telegram Profile"
    :style="{ width: '430px', maxWidth: '96vw' }">
    <div v-if="telegramLoading" class="drawer-loading"><i class="pi pi-spin pi-spinner" /></div>
    <template v-else>
      <div class="profile-head">
        <Avatar :label="initials(telegramProfile.employee?.fullName)" shape="circle" size="large" />
        <div class="identity-copy">
          <strong>{{ telegramProfile.employee?.fullName || 'Employee' }}</strong>
          <span>{{ telegramProfile.employee?.employeeCode }}</span>
        </div>
        <Tag :value="telegramProfile.verified ? 'Verified' : 'Not Linked'"
          :severity="telegramProfile.verified ? 'success' : 'warn'" />
      </div>

      <div v-if="telegramProfile.profile" class="profile-list">
        <div><span>Username</span><strong>{{ telegramValue(telegramProfile.profile.username, '@') }}</strong></div>
        <div><span>Name</span><strong>{{ telegramFullName(telegramProfile.profile) }}</strong></div>
        <div><span>User ID</span><strong>{{ telegramProfile.profile.userId || '—' }}</strong></div>
        <div><span>Chat ID</span><strong>{{ telegramProfile.activeChatId || telegramProfile.profile.chatId || '—'
            }}</strong></div>
        <div><span>Language</span><strong>{{ telegramProfile.profile.languageCode || '—' }}</strong></div>
        <div><span>Chat Type</span><strong>{{ telegramProfile.profile.chatType || '—' }}</strong></div>
        <div><span>Premium</span><strong>{{ telegramProfile.profile.isPremium ? 'Yes' : 'No' }}</strong></div>
        <div><span>Verified</span><strong>{{ formatDateTime(telegramProfile.profile.verifiedAt) }}</strong></div>
        <div><span>Last Seen</span><strong>{{ formatDateTime(telegramProfile.profile.lastSeenAt) }}</strong></div>
      </div>
      <div v-else class="empty-state"><i class="pi pi-send" /><strong>Not linked</strong></div>
    </template>
  </Drawer>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Tag from 'primevue/tag'
import MetricTile from '../components/MetricTile.vue'
import { api } from '../api/client.js'

const toast = useToast()
const confirm = useConfirm()
const items = ref([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const categoryFilter = ref('')
const deliveryFilter = ref('')
const loading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const dialog = ref(false)
const credentialDialog = ref(false)
const telegramDialog = ref(false)
const telegramLoading = ref(false)

const summary = reactive({ totalEmployees: 0, activeEmployees: 0, telegramLinked: 0, firstLogin: 0, pdfOnly: 0 })
const credentials = reactive({ type: 'LOGIN_PASSWORD', employeeCode: '', loginId: '', password: '' })
const telegramProfile = reactive({ employee: null, verified: false, activeChatId: '', profile: null })

const categories = [
  { label: 'Local Staff', value: 'LOCAL' },
  { label: 'Foreigner', value: 'FOREIGNER' }
]
const categoryFilters = [{ label: 'All Categories', value: '' }, ...categories]
const deliveries = [
  { label: 'Company Email', value: 'EMAIL' },
  { label: 'Telegram', value: 'TELEGRAM' }
]
const deliveryFilters = [{ label: 'All Delivery', value: '' }, ...deliveries]

const form = reactive({
  _id: '', employeeCode: '', fullName: '', dateJoin: null, dateOfBirth: null, staffCategory: 'LOCAL', department: '', position: '',
  companyEmail: '', preferredDelivery: 'EMAIL', active: true
})

const credentialDialogTitle = 'Telegram Verification Password'

function resetForm() {
  Object.assign(form, {
    _id: '', employeeCode: '', fullName: '', dateJoin: null, dateOfBirth: null, staffCategory: 'LOCAL', department: '', position: '',
    companyEmail: '', preferredDelivery: 'EMAIL', active: true
  })
}
function openCreate() { resetForm(); dialog.value = true }
function dateOnlyToPicker(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  // Mongo stores Date Join at UTC midnight. Rebuild it as a LOCAL Date using
  // the UTC calendar components so PrimeVue DatePicker displays the exact day.
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
}

function pickerToDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function employeePayload() {
  return {
    employeeCode: String(form.employeeCode || '').trim(),
    fullName: String(form.fullName || '').trim(),
    dateJoin: pickerToDateOnly(form.dateJoin),
    dateOfBirth: pickerToDateOnly(form.dateOfBirth),
    staffCategory: form.staffCategory,
    department: String(form.department || '').trim(),
    position: String(form.position || '').trim(),
    preferredDelivery: form.preferredDelivery,
    companyEmail: form.preferredDelivery === 'EMAIL' ? String(form.companyEmail || '').trim() : '',
    active: form.active !== false
  }
}

function openEdit(row) {
  Object.assign(form, {
    _id: row._id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    dateJoin: dateOnlyToPicker(row.dateJoin),
    dateOfBirth: dateOnlyToPicker(row.dateOfBirth),
    staffCategory: row.staffCategory,
    department: row.department || '',
    position: row.position || '',
    companyEmail: row.companyEmail || '',
    preferredDelivery: row.preferredDelivery,
    active: row.active !== false
  })
  dialog.value = true
}

async function load(nextPage = page.value) {
  loading.value = true
  try {
    page.value = nextPage
    const { data } = await api.get('/employees', {
      params: {
        page: nextPage,
        limit: 10,
        search: search.value,
        staffCategory: categoryFilter.value,
        preferredDelivery: deliveryFilter.value
      }
    })
    items.value = data.items
    total.value = data.total
    Object.assign(summary, data.summary || {})
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Employees', detail: error.response?.data?.message || error.message, life: 4500 })
  } finally { loading.value = false }
}
function onPage(event) { load(event.page + 1) }
function showCredentials(value) {
  if (!value) return
  const type = value.type || value.credentialType || (value.pdfPassword ? 'PDF_PASSWORD' : 'LOGIN_PASSWORD')
  credentials.type = type
  credentials.employeeCode = value.employeeCode || value.loginId || ''
  credentials.loginId = value.loginId || value.employeeCode || ''
  credentials.password = value.password || value.pdfPassword || value.temporaryPassword || ''
  if (credentials.password) credentialDialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = employeePayload()
    if (!payload.dateJoin) throw new Error('Date Join is required')
    if (!payload.dateOfBirth) throw new Error('Date of Birth is required')

    if (form._id) {
      const { data } = await api.put(`/employees/${form._id}`, payload)
      showCredentials(data.issuedCredentials)
      toast.add({ severity: 'success', summary: 'Employee updated', life: 2200 })
      dialog.value = false
      await load(page.value)
    } else {
      const { data } = await api.post('/employees', payload)
      showCredentials(data.issuedCredentials || data.temporaryCredentials)
      toast.add({ severity: 'success', summary: 'Employee created', life: 2200 })
      dialog.value = false
      await load(1)
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot save', detail: error.response?.data?.message || error.message, life: 5000 })
  } finally { saving.value = false }
}

function confirmResetPassword(employee) {
  confirm.require({
    header: 'Reset Telegram Verification Password',
    message: `Unlink Telegram and generate a new verification password for ${employee.fullName}?`,
    icon: 'pi pi-key',
    rejectLabel: 'Cancel',
    acceptLabel: 'Reset',
    accept: () => resetPassword(employee)
  })
}
async function resetPassword(employee) {
  try {
    const { data } = await api.post(`/employees/${employee._id}/reset-temporary-password`)
    showCredentials({
      type: data.credentialType,
      employeeCode: data.employeeCode || data.loginId || employee.employeeCode,
      loginId: data.loginId,
      password: data.password || data.pdfPassword || data.temporaryPassword
    })
    await load(page.value)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot reset', detail: error.response?.data?.message || error.message, life: 5000 })
  }
}

async function openTelegramProfile(employee) {
  telegramDialog.value = true
  telegramLoading.value = true
  Object.assign(telegramProfile, { employee: null, verified: false, activeChatId: '', profile: null })
  try {
    const { data } = await api.get(`/employees/${employee._id}/telegram-profile`)
    Object.assign(telegramProfile, data)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Telegram', detail: error.response?.data?.message || error.message, life: 4500 })
    telegramDialog.value = false
  } finally { telegramLoading.value = false }
}

async function exportCredentials() {
  exporting.value = true
  try {
    const response = await api.get('/employees/export-credentials', { responseType: 'blob' })
    const disposition = response.headers['content-disposition'] || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    const filename = match?.[1] || 'e-PaySlip-Employee-Credentials.xlsx'
    const url = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.add({ severity: 'success', summary: 'Exported', life: 2200 })
  } catch (error) {
    let detail = 'Could not export employee credentials'
    if (error.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await error.response.data.text())
        detail = parsed.message || detail
      } catch { /* keep generic message */ }
    } else detail = error.response?.data?.message || error.message || detail
    toast.add({ severity: 'error', summary: 'Export failed', detail, life: 6000 })
  } finally { exporting.value = false }
}

async function copyCredentials() {
  const text = `Employee ID: ${credentials.employeeCode}\nTelegram Verification Password: ${credentials.password}`
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary: 'Copied', life: 1800 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Copy unavailable', life: 2500 })
  }
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?'
}
function accountLabel(employee) {
  return employee.preferredDelivery === 'TELEGRAM' ? (employee.telegramVerified ? 'Telegram Linked' : 'No Portal') : 'Email Only'
}
function accountSeverity(employee) {
  return employee.telegramVerified ? 'success' : 'info'
}
function telegramValue(value, prefix = '') { return value ? `${prefix}${value}` : '—' }
function telegramFullName(profile) { return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || '—' }
function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date)
}
function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

onMounted(() => load())
</script>

<style scoped>
.employee-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.employee-filters {
  flex: 1;
}

.tag-stack {
  display: grid;
  justify-items: start;
  gap: 3px;
}

.mini-text {
  color: #7a8798;
  font-size: 10.5px;
}

.telegram-link {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.telegram-link>.pi-angle-right {
  margin-left: auto;
  color: #a5afbd;
  font-size: 11px;
}

.telegram-link:hover .stack-cell strong {
  color: #0d8c69;
}

.credential-mode {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #637083;
  font-size: 11.5px;
  align-self: end;
}

.credential-mode .p-tag {
  width: fit-content;
}

.credential-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.credential-grid>div {
  min-height: 76px;
  border: 1px solid #e8edf2;
  border-radius: 10px;
  padding: 12px;
  display: grid;
  align-content: center;
  gap: 4px;
  background: #fbfcfd;
}

.credential-grid span {
  color: #718096;
  font-size: 10.5px;
  font-weight: 650;
}

.credential-grid strong,
.credential-grid code {
  color: #1e293b;
  font-size: 17px;
  font-weight: 820;
}

.credential-grid code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .05em;
}

.telegram-drawer {
  width: min(430px, 96vw) !important;
}

.drawer-loading {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: #8090a4;
}

.profile-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf1f5;
}

.profile-list {
  display: grid;
  margin-top: 6px;
}

.profile-list>div {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #f0f3f6;
}

.profile-list span {
  color: #748196;
  font-size: 11px;
}

.profile-list strong {
  color: #263449;
  font-size: 11.5px;
  text-align: right;
  overflow-wrap: anywhere;
}

@media (max-width: 980px) {
  .employee-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {

  .credential-grid,
  .employee-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
