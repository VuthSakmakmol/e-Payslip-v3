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
          <Button label="Import Employees" icon="pi pi-upload" severity="secondary" outlined @click="openImport" />
          <Button label="Export" icon="pi pi-file-excel" severity="secondary" outlined :loading="exporting"
            v-tooltip.top="'Export employee 6-digit e-PaySlip passwords'" @click="exportCredentials" />
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
              <span>Line: {{ data.line || '—' }}</span>
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
                <strong>{{ data.companyEmail || 'Email Address' }}</strong>
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

        <Column header="e-PaySlip Password" style="min-width: 150px">
          <template #body="{ data }">
            <div class="stack-cell">
              <code v-if="data.employeePassword || data.pdfPassword" class="inline-code">{{ data.employeePassword || data.pdfPassword }}</code>
              <span v-else>—</span>
              <small v-if="data.preferredDelivery === 'TELEGRAM'">PDF + Telegram verification</small>
              <small v-else>PDF password</small>
            </div>
          </template>
        </Column>

        <Column header="Access" style="min-width: 125px">
          <template #body="{ data }">
            <Tag :value="accountLabel(data)" :severity="accountSeverity(data)" />
          </template>
        </Column>

        <Column header="Actions" frozen alignFrozen="right" style="width: 180px">
          <template #body="{ data }">
            <div class="row-actions">
              <Button icon="pi pi-pencil" severity="secondary" text rounded v-tooltip.top="'Edit'"
                @click="openEdit(data)" />
              <Button icon="pi pi-key" severity="secondary" text rounded
                v-tooltip.top="'Reset e-PaySlip password'" @click="confirmResetEmployeePassword(data)" />
              <Button icon="pi pi-trash" severity="danger" text rounded v-tooltip.top="'Delete employee'"
                :loading="deletingId === data._id" :disabled="Boolean(deletingId)" @click="confirmDeleteEmployee(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>


  <Dialog v-model:visible="importDialog" modal header="Import Employees"
    :closable="!importing" :closeOnEscape="!importing" :dismissableMask="false"
    :style="{ width: '720px', maxWidth: 'calc(100vw - 28px)' }" :breakpoints="{ '760px': '96vw' }">
    <div class="employee-import-stack">
      <div class="import-rule-card">
        <span class="import-rule-icon"><i class="pi pi-shield" /></span>
        <div>
          <strong>New employees only · all-or-nothing validation</strong>
          <span>Existing Employee IDs are blocked. If any row is invalid, no employee from the file is created.</span>
        </div>
      </div>

      <div class="import-template-row">
        <div>
          <strong>1. Download the employee template</strong>
          <span>Includes a blank Employees sheet, examples, and field rules.</span>
        </div>
        <Button label="Download Template" icon="pi pi-download" severity="secondary" outlined
          :loading="downloadingTemplate" :disabled="importing" @click="downloadImportTemplate" />
      </div>

      <div class="import-template-row import-upload-row">
        <div>
          <strong>2. Upload the completed Excel file</strong>
          <span>Every employee receives one unique 6-digit e-PaySlip password. For TELEGRAM, the same password is used for first-time verification.</span>
        </div>
        <FileUpload mode="basic" name="file" accept=".xlsx,.xls" :maxFileSize="10000000" :customUpload="true"
          :disabled="importing" chooseLabel="Choose File" chooseIcon="pi pi-folder-open" @select="pickImportFile" />
      </div>

      <div v-if="importFile" class="selected-import-file">
        <span><i class="pi pi-file-excel" /></span>
        <div>
          <strong>{{ importFile.name }}</strong>
          <small>{{ formatFileSize(importFile.size) }}</small>
        </div>
        <Button icon="pi pi-times" severity="secondary" text rounded v-tooltip.top="'Remove file'" :disabled="importing" @click="clearImportFile" />
      </div>

      <div v-if="importing || importProgress.status !== 'IDLE'" class="import-progress-box">
        <div class="import-progress-head">
          <div>
            <strong>{{ importProgress.message || 'Preparing employee import…' }}</strong>
            <span v-if="importProgress.currentEmployeeCode">Employee ID: {{ importProgress.currentEmployeeCode }}</span>
            <span v-else>Import runs on the server and will continue without a browser request timeout.</span>
          </div>
          <Tag :value="importProgress.status === 'RECONNECTING' ? 'Reconnecting' : importProgress.status === 'CANCELLING' ? 'Cancelling' : importProgress.status === 'CANCELLED' ? 'Cancelled' : importProgress.status === 'COMPLETED' ? 'Completed' : importProgress.status === 'FAILED' ? 'Failed' : 'Processing'"
            :severity="importProgress.status === 'COMPLETED' ? 'success' : importProgress.status === 'FAILED' ? 'danger' : importProgress.status === 'CANCELLED' ? 'secondary' : importProgress.status === 'CANCELLING' || importProgress.status === 'RECONNECTING' ? 'warn' : 'info'" />
        </div>

        <div class="import-progress-line">
          <div class="import-progress-track" role="progressbar" aria-label="Employee import progress" aria-valuemin="0" aria-valuemax="100"
            :aria-valuenow="importProgress.progress">
            <div class="import-progress-fill" :style="{ width: `${importProgress.progress}%` }" />
          </div>
          <strong>{{ importProgress.progress }}%</strong>
        </div>

        <div v-if="importProgress.totalRows" class="import-progress-stats">
          <div><span>Rows</span><strong>{{ importProgress.totalRows }}</strong></div>
          <div><span>Validated</span><strong>{{ importProgress.validatedRows }}</strong></div>
          <div><span>Created</span><strong>{{ importProgress.createdEmployees }}</strong></div>
        </div>
      </div>

      <div v-if="importErrors.length" class="import-error-box">
        <div class="import-error-head">
          <div>
            <strong>Import blocked</strong>
            <span>{{ importErrors.length }} issue{{ importErrors.length === 1 ? '' : 's' }} found. Nothing was imported.</span>
          </div>
          <Tag value="Fix Excel and upload again" severity="danger" />
        </div>
        <div class="import-error-list">
          <div v-for="(error, index) in importErrors.slice(0, 12)" :key="`${error.row}-${index}`">
            <code>Row {{ error.row || '—' }}</code>
            <span>{{ error.employeeCode ? `${error.employeeCode} · ` : '' }}{{ error.message }}</span>
          </div>
          <small v-if="importErrors.length > 12">+ {{ importErrors.length - 12 }} more issues</small>
        </div>
      </div>

      <div v-if="importResult" class="import-success-box">
        <div class="import-success-head">
          <i class="pi pi-check-circle" />
          <div>
            <strong>{{ importResult.imported }} employees imported</strong>
            <span>The Employee Master has been updated successfully.</span>
          </div>
        </div>
        <div class="import-result-grid">
          <div><span>Email</span><strong>{{ importResult.emailEmployees }}</strong></div>
          <div><span>Telegram</span><strong>{{ importResult.telegramEmployees }}</strong></div>
          <div><span>Inactive</span><strong>{{ importResult.inactiveEmployees }}</strong></div>
        </div>
        <div v-if="importResult.imported" class="telegram-import-note">
          <i class="pi pi-key" />
          <span>One unique 6-digit e-PaySlip password was generated for every employee. The same password opens the PDF and, for Telegram employees, verifies Telegram on first link. Use <strong>Export</strong> to download the credentials.</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button v-if="importing" label="Stop Import" icon="pi pi-stop-circle" severity="danger" outlined
        :loading="cancellingImport" :disabled="cancellingImport || importProgress.status === 'CANCELLING'" @click="confirmCancelImport" />
      <Button :label="importResult ? 'Done' : 'Close'" severity="secondary" text :disabled="importing" @click="closeImport" />
      <Button v-if="!importResult && !importing" label="Import Employees" icon="pi pi-upload"
        :disabled="!importFile" @click="importEmployees" />
    </template>
  </Dialog>

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
          <label>Line</label>
          <InputText v-model.trim="form.line" placeholder="e.g. Line 12" />
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
          <label class="required">Email Address</label>
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
        <span>e-PaySlip Password</span>
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
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FileUpload from 'primevue/fileupload'
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
const importing = ref(false)
const cancellingImport = ref(false)
const downloadingTemplate = ref(false)
const deletingId = ref('')
const importDialog = ref(false)
const importFile = ref(null)
const importErrors = ref([])
const importResult = ref(null)
const dialog = ref(false)
const credentialDialog = ref(false)
const telegramDialog = ref(false)
const telegramLoading = ref(false)
const importProgress = reactive({
  jobId: '',
  status: 'IDLE',
  phase: 'IDLE',
  progress: 0,
  message: '',
  totalRows: 0,
  validatedRows: 0,
  createdEmployees: 0,
  currentEmployeeCode: ''
})
let importPollGeneration = 0
let importUploadController = null

const summary = reactive({ totalEmployees: 0, activeEmployees: 0, telegramLinked: 0, firstLogin: 0, pdfOnly: 0 })
const credentials = reactive({ type: 'EMPLOYEE_PASSWORD', employeeCode: '', loginId: '', password: '' })
const telegramProfile = reactive({ employee: null, verified: false, activeChatId: '', profile: null })

const categories = [
  { label: 'Local Staff', value: 'LOCAL' },
  { label: 'Foreigner', value: 'FOREIGNER' }
]
const categoryFilters = [{ label: 'All Categories', value: '' }, ...categories]
const deliveries = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'Telegram', value: 'TELEGRAM' }
]
const deliveryFilters = [{ label: 'All Delivery', value: '' }, ...deliveries]

const form = reactive({
  _id: '', employeeCode: '', fullName: '', dateJoin: null, staffCategory: 'LOCAL', department: '', line: '', position: '',
  companyEmail: '', preferredDelivery: 'EMAIL', active: true
})

const credentialDialogTitle = computed(() => 'e-PaySlip Password')

function resetForm() {
  Object.assign(form, {
    _id: '', employeeCode: '', fullName: '', dateJoin: null, staffCategory: 'LOCAL', department: '', line: '', position: '',
    companyEmail: '', preferredDelivery: 'EMAIL', active: true
  })
}
function openCreate() { resetForm(); dialog.value = true }

function resetImportProgress() {
  Object.assign(importProgress, {
    jobId: '',
    status: 'IDLE',
    phase: 'IDLE',
    progress: 0,
    message: '',
    totalRows: 0,
    validatedRows: 0,
    createdEmployees: 0,
    currentEmployeeCode: ''
  })
}

function openImport() {
  importPollGeneration += 1
  importFile.value = null
  importErrors.value = []
  importResult.value = null
  resetImportProgress()
  importDialog.value = true
}

function closeImport() {
  if (importing.value) return
  importPollGeneration += 1
  importDialog.value = false
  importFile.value = null
  importErrors.value = []
  importResult.value = null
  resetImportProgress()
}

function pickImportFile(event) {
  if (importing.value) return
  importFile.value = event.files?.[0] || null
  importErrors.value = []
  importResult.value = null
  resetImportProgress()
}

function clearImportFile() {
  if (importing.value) return
  importFile.value = null
  importErrors.value = []
  importResult.value = null
  resetImportProgress()
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function downloadImportTemplate() {
  downloadingTemplate.value = true
  try {
    const response = await api.get('/employees/import-template', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'e-PaySlip-Employee-Import-Template.xlsx'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Template', detail: error.response?.data?.message || error.message, life: 5000 })
  } finally {
    downloadingTemplate.value = false
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function applyImportJob(job) {
  if (!job) return
  const serverProgress = Number(job.progress) || 0
  // The first 5% is the real browser -> server file upload. The remaining
  // 95% comes directly from the backend job's actual processing checkpoints.
  const overallProgress = serverProgress >= 100
    ? 100
    : Math.min(99, Math.max(5, 5 + Math.round(serverProgress * 0.95)))

  Object.assign(importProgress, {
    jobId: job.id || importProgress.jobId,
    status: job.status || 'RUNNING',
    phase: job.phase || '',
    progress: overallProgress,
    message: job.message || 'Processing employee import…',
    totalRows: Number(job.totalRows) || 0,
    validatedRows: Number(job.validatedRows) || 0,
    createdEmployees: Number(job.createdEmployees) || 0,
    currentEmployeeCode: job.currentEmployeeCode || ''
  })
}

async function waitForEmployeeImport(jobId, generation) {
  while (generation === importPollGeneration) {
    try {
      const { data } = await api.get(`/employees/import-jobs/${jobId}`, {
        // No Axios timeout for an import progress request. Each request is small,
        // and a temporary network interruption must not cancel the server job.
        timeout: 0
      })
      applyImportJob(data)

      if (data.status === 'COMPLETED') return { completed: true, result: data.result }
      if (data.status === 'CANCELLED') return { cancelled: true, job: data }
      if (data.status === 'FAILED') {
        const error = new Error(data.message || 'Employee import failed')
        error.importErrors = Array.isArray(data.errors) ? data.errors : []
        throw error
      }
    } catch (error) {
      if (error.importErrors || error.response?.status === 404 || error.response?.status === 401) throw error

      // The backend job keeps running even when the browser briefly loses its
      // connection. Keep reconnecting instead of converting it into a timeout.
      importProgress.status = 'RECONNECTING'
      importProgress.message = 'Connection interrupted. Import is still running on the server; reconnecting…'
      await wait(1500)
      continue
    }

    await wait(600)
  }

  throw new Error('Employee import progress tracking stopped')
}

function confirmCancelImport() {
  if (!importing.value || cancellingImport.value) return
  const created = Number(importProgress.createdEmployees) || 0
  confirm.require({
    header: 'Stop Employee Import',
    message: created > 0
      ? `Stop this import now? ${created} employee record(s) have already been created by this import. They will be removed automatically so the import remains all-or-nothing.`
      : 'Stop this import now? No employees from this file will be kept.',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Continue Import',
    acceptLabel: 'Stop Import',
    acceptClass: 'p-button-danger',
    accept: cancelEmployeeImport
  })
}

async function cancelEmployeeImport() {
  if (!importing.value || cancellingImport.value) return
  cancellingImport.value = true
  importProgress.status = 'CANCELLING'
  importProgress.phase = 'CANCELLING'
  importProgress.message = importProgress.createdEmployees > 0
    ? `Stopping import and removing ${importProgress.createdEmployees} employee record(s) created by this import…`
    : 'Stopping employee import…'

  try {
    if (importProgress.jobId) {
      const { data } = await api.post(`/employees/import-jobs/${importProgress.jobId}/cancel`, {}, { timeout: 0 })
      applyImportJob(data)
      return
    }

    // If the Excel file is still uploading and the backend job does not exist
    // yet, abort the upload request locally. Normal imports are small, so this
    // path is usually only visible for a very slow connection.
    if (importUploadController) {
      importUploadController.abort()
      return
    }

    throw new Error('The employee import could not be cancelled because no active job was found.')
  } catch (error) {
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') return
    toast.add({
      severity: 'error',
      summary: 'Cannot stop import',
      detail: error.response?.data?.message || error.message,
      life: 5000
    })
  } finally {
    cancellingImport.value = false
  }
}

async function importEmployees() {
  if (!importFile.value || importing.value) return

  const generation = ++importPollGeneration
  importing.value = true
  importErrors.value = []
  importResult.value = null
  resetImportProgress()
  Object.assign(importProgress, {
    status: 'UPLOADING',
    phase: 'UPLOADING',
    progress: 0,
    message: 'Uploading employee file…'
  })

  try {
    const body = new FormData()
    body.append('file', importFile.value)
    importUploadController = new AbortController()

    const { data } = await api.post('/employees/import', body, {
      // Explicitly no timeout. More importantly, this request only starts the
      // background job; it does not wait for 500 employee records to finish.
      timeout: 0,
      signal: importUploadController.signal,
      onUploadProgress: (event) => {
        if (!event.total) return
        const ratio = Math.min(Math.max(event.loaded / event.total, 0), 1)
        importProgress.progress = Math.max(importProgress.progress, Math.round(ratio * 5))
        importProgress.message = ratio >= 1 ? 'Upload complete. Starting server processing…' : 'Uploading employee file…'
      }
    })

    const jobId = data.jobId || data.job?.id
    if (!jobId) throw new Error('Employee import did not return a job ID')

    importProgress.jobId = jobId
    applyImportJob(data.job)
    const outcome = await waitForEmployeeImport(jobId, generation)

    if (generation !== importPollGeneration) return
    if (outcome?.cancelled) {
      importProgress.status = 'CANCELLED'
      importProgress.phase = 'CANCELLED'
      importProgress.message = outcome.job?.message || 'Employee import cancelled. No employees from this import were kept.'
      importProgress.createdEmployees = 0
      toast.add({ severity: 'info', summary: 'Import cancelled', detail: importProgress.message, life: 4500 })
      await load(1)
      return
    }

    const result = outcome?.result
    importResult.value = result
    importFile.value = null
    toast.add({
      severity: 'success',
      summary: 'Employees imported',
      detail: `${result.imported} employees added`,
      life: 3000
    })
    await load(1)
  } catch (error) {
    if (generation !== importPollGeneration) return
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
      importProgress.status = 'CANCELLED'
      importProgress.phase = 'CANCELLED'
      importProgress.message = 'Employee import cancelled before server processing started. No employees were created.'
      toast.add({ severity: 'info', summary: 'Import cancelled', detail: importProgress.message, life: 4000 })
      return
    }
    const details = error.importErrors || error.response?.data?.details
    if (Array.isArray(details)) importErrors.value = details
    importProgress.status = 'FAILED'
    importProgress.phase = 'FAILED'
    importProgress.progress = 100
    importProgress.message = error.response?.data?.message || error.message || 'Employee import failed'
    toast.add({
      severity: 'error',
      summary: 'Import blocked',
      detail: importProgress.message,
      life: 6000
    })
  } finally {
    importUploadController = null
    cancellingImport.value = false
    if (generation === importPollGeneration) importing.value = false
  }
}

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
    staffCategory: form.staffCategory,
    department: String(form.department || '').trim(),
    line: String(form.line || '').trim(),
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
    staffCategory: row.staffCategory,
    department: row.department || '',
    line: row.line || '',
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
  credentials.type = 'EMPLOYEE_PASSWORD'
  credentials.employeeCode = value.employeeCode || value.loginId || ''
  credentials.loginId = value.loginId || value.employeeCode || ''
  credentials.password = value.password || value.employeePassword || value.pdfPassword || value.temporaryPassword || ''
  if (credentials.password) credentialDialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = employeePayload()
    if (!payload.dateJoin) throw new Error('Date Join is required')

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

function confirmDeleteEmployee(employee) {
  confirm.require({
    header: 'Delete Employee',
    message: `Permanently delete ${employee.fullName} (${employee.employeeCode}) from Employee Master? This cannot be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => deleteEmployee(employee)
  })
}

async function deleteEmployee(employee) {
  deletingId.value = employee._id
  try {
    const { data } = await api.delete(`/employees/${employee._id}`)
    toast.add({
      severity: 'success',
      summary: 'Employee deleted',
      detail: `${data.employeeCode || employee.employeeCode} · ${data.fullName || employee.fullName}`,
      life: 3000
    })

    const lastItemOnPage = items.value.length === 1 && page.value > 1
    await load(lastItemOnPage ? page.value - 1 : page.value)
  } catch (error) {
    const details = error.response?.data?.details
    const history = details && typeof details === 'object'
      ? ` Payroll records: ${details.payrollRecords || 0}; delivery logs: ${details.deliveryLogs || 0}.`
      : ''
    toast.add({
      severity: 'error',
      summary: 'Cannot delete employee',
      detail: `${error.response?.data?.message || error.message}${history}`,
      life: 7000
    })
  } finally {
    deletingId.value = ''
  }
}

function confirmResetEmployeePassword(employee) {
  const telegramNote = employee.preferredDelivery === 'TELEGRAM'
    ? ' Telegram will be unlinked and must be verified again using the new password.'
    : ''
  confirm.require({
    header: 'Reset e-PaySlip Password',
    message: `Generate a new 6-digit e-PaySlip password for ${employee.fullName}? Future PDFs will use the new password.${telegramNote} Previously released PDFs keep their old password.`,
    icon: 'pi pi-key',
    rejectLabel: 'Cancel',
    acceptLabel: 'Reset',
    accept: () => resetEmployeePassword(employee)
  })
}

async function resetEmployeePassword(employee) {
  try {
    const { data } = await api.post(`/employees/${employee._id}/reset-password`)
    showCredentials({
      type: 'EMPLOYEE_PASSWORD',
      employeeCode: data.employeeCode || employee.employeeCode,
      password: data.password || data.employeePassword || data.pdfPassword
    })
    await load(page.value)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot reset password', detail: error.response?.data?.message || error.message, life: 5000 })
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
  const text = `Employee ID: ${credentials.employeeCode}\ne-PaySlip Password: ${credentials.password}`
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
onBeforeUnmount(() => {
  // Stop browser polling only. Any already-started import continues on the backend.
  importPollGeneration += 1
})
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


.employee-import-stack {
  display: grid;
  gap: 12px;
}

.import-rule-card,
.import-template-row,
.selected-import-file,
.import-success-box,
.import-error-box {
  border: 1px solid #e5eaf0;
  border-radius: 12px;
  background: #fbfcfd;
}

.import-rule-card {
  display: flex;
  gap: 11px;
  padding: 13px 14px;
  background: #f4fbf8;
  border-color: #cfeee2;
}

.import-rule-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #dff6ed;
  color: #078360;
  flex: 0 0 auto;
}

.import-rule-card > div,
.import-template-row > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.import-rule-card strong,
.import-template-row strong {
  color: #263449;
  font-size: 12px;
}

.import-rule-card span,
.import-template-row span {
  color: #708095;
  font-size: 11px;
  line-height: 1.45;
}

.import-template-row {
  min-height: 72px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.selected-import-file {
  min-height: 58px;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.selected-import-file > span {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #e7f7f1;
  color: #087d5f;
}

.selected-import-file > div {
  display: grid;
  gap: 2px;
}

.selected-import-file strong {
  font-size: 11.5px;
  color: #29384d;
}

.selected-import-file small {
  color: #8190a3;
  font-size: 10.5px;
}

.import-progress-box {
  padding: 13px;
  border: 1px solid #dbe5ee;
  border-radius: 12px;
  background: #f8fafc;
  display: grid;
  gap: 12px;
}

.import-progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.import-progress-head > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.import-progress-head strong {
  color: #263449;
  font-size: 12px;
}

.import-progress-head span {
  color: #748196;
  font-size: 10.5px;
  overflow-wrap: anywhere;
}

.import-progress-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 10px;
  align-items: center;
}

.import-progress-line > strong {
  color: #334155;
  font-size: 12px;
  text-align: right;
}

.import-progress-track {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7edf3;
}

.import-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #0aa77a;
  transition: width .28s ease;
}

.import-progress-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.import-progress-stats > div {
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid #e2e8ef;
  border-radius: 9px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.import-progress-stats span {
  color: #7a8798;
  font-size: 10.5px;
}

.import-progress-stats strong {
  color: #263449;
  font-size: 14px;
}

.import-error-box {
  overflow: hidden;
  border-color: #f1c7c7;
  background: #fffafa;
}

.import-error-head {
  padding: 11px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #f6dddd;
}

.import-error-head > div {
  display: grid;
  gap: 2px;
}

.import-error-head strong { color: #a43434; font-size: 12px; }
.import-error-head span { color: #8f6262; font-size: 10.5px; }

.import-error-list {
  display: grid;
  padding: 4px 12px 10px;
}

.import-error-list > div {
  min-height: 34px;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid #f7e5e5;
}

.import-error-list code { font-size: 10.5px; color: #b34848; }
.import-error-list span { font-size: 10.5px; color: #694f4f; }
.import-error-list small { padding-top: 8px; color: #a26767; }

.import-success-box {
  padding: 13px;
  border-color: #ccebdd;
  background: #f6fcf9;
  display: grid;
  gap: 12px;
}

.import-success-head {
  display: flex;
  gap: 10px;
  align-items: center;
}

.import-success-head > i { color: #07956d; font-size: 22px; }
.import-success-head > div { display: grid; gap: 2px; }
.import-success-head strong { color: #14644f; font-size: 12.5px; }
.import-success-head span { color: #5f7f74; font-size: 10.5px; }

.import-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.import-result-grid > div {
  padding: 9px 10px;
  border-radius: 9px;
  border: 1px solid #dcedE6;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.import-result-grid span { color: #75877f; font-size: 10.5px; }
.import-result-grid strong { color: #24483d; font-size: 14px; }

.telegram-import-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: #526d66;
  font-size: 10.5px;
  line-height: 1.45;
}

.telegram-import-note i { color: #d59a16; margin-top: 2px; }

@media (max-width: 980px) {
  .employee-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {

  .credential-grid,
  .employee-metrics,
  .import-result-grid,
  .import-progress-stats {
    grid-template-columns: 1fr;
  }

  .import-template-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
