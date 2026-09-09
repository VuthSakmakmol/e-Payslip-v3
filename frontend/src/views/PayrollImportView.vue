<template>
  <div class="page-stack">
    <div class="surface-panel import-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <Tag value="Memory Only" severity="info" />
          <Tag
            :value="form.releaseMode === 'UPDATE' ? 'Update / Correction' : 'Full Payroll'"
            :severity="form.releaseMode === 'UPDATE' ? 'warn' : 'info'"
          />
        </div>
        <div class="toolbar-right">
          <Button
            label="Import"
            icon="pi pi-upload"
            :loading="loading"
            :disabled="form.releaseMode === 'UPDATE' && availabilityChecked && !updateAllowed"
            @click="submit"
          />
        </div>
      </div>

      <div class="surface-body import-body">
        <div class="release-mode-block">
          <label class="required release-mode-label">Release Type</label>
          <div class="release-mode-grid">
            <button
              type="button"
              class="release-mode-card"
              :class="{ selected: form.releaseMode === 'FULL' }"
              @click="selectReleaseMode('FULL')"
            >
              <span class="mode-icon full"><i class="pi pi-users" /></span>
              <span class="mode-copy">
                <strong>Full Payroll</strong>
                <small>Default. Every expected employee must be included. No one can be left out.</small>
              </span>
              <i v-if="form.releaseMode === 'FULL'" class="pi pi-check-circle mode-check" />
            </button>

            <button
              type="button"
              class="release-mode-card"
              :class="{ selected: form.releaseMode === 'UPDATE' }"
              @click="selectReleaseMode('UPDATE')"
            >
              <span class="mode-icon update"><i class="pi pi-refresh" /></span>
              <span class="mode-copy">
                <strong>Update / Correction</strong>
                <small>Only employees in this correction file are checked and sent again.</small>
              </span>
              <i v-if="form.releaseMode === 'UPDATE'" class="pi pi-check-circle mode-check" />
            </button>
          </div>

          <div v-if="form.releaseMode === 'UPDATE'" class="correction-notice" :class="{ blocked: availabilityChecked && !updateAllowed }">
            <i :class="availabilityChecked && !updateAllowed ? 'pi pi-lock' : 'pi pi-info-circle'" />
            <div>
              <strong>{{ availabilityChecked && !updateAllowed ? 'Correction not available yet' : 'Correction mode' }}</strong>
              <span v-if="availabilityLoading">Checking the previous Full Payroll release…</span>
              <span v-else-if="availabilityChecked && updateAllowed">
                Previous Full Payroll confirmed{{ availability.fullEmployeeCount ? ` (${availability.fullEmployeeCount} employees)` : '' }}.
                Employees not included in this upload will be intentionally ignored and will not receive another payslip.
              </span>
              <span v-else-if="availabilityChecked">
                A Full Payroll must be released for this exact period before Update / Correction can be used.
              </span>
              <span v-else>
                Select the payroll period. The system will verify that a Full Payroll was already released before allowing this mode.
              </span>
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="required">Employee Category</label>
            <Select
              v-model="form.staffCategory"
              :options="categories"
              optionLabel="label"
              optionValue="value"
              @change="onCategoryChange"
            />
          </div>
          <div v-if="form.staffCategory === 'LOCAL'" class="form-field">
            <label class="required">Pay Period</label>
            <Select
              v-model="form.payPeriodId"
              :options="activePeriods"
              optionLabel="name"
              optionValue="_id"
              placeholder="Select"
            />
          </div>
          <div class="form-field">
            <label class="required">Year</label>
            <InputNumber
              v-model="form.year"
              :useGrouping="false"
              :min="2000"
              :max="2100"
            />
          </div>
          <div class="form-field">
            <label class="required">Month</label>
            <Select
              v-model="form.month"
              :options="months"
              optionLabel="label"
              optionValue="value"
            />
          </div>
        </div>

        <div class="file-area">
          <div class="file-box">
            <div class="file-box-main">
              <span class="file-box-icon"><i class="pi pi-file-excel" /></span>
              <div class="file-box-copy">
                <strong>{{ file?.name || 'Payroll XLSX' }}</strong>
                <span>{{ file ? formatSize(file.size) : '87-column company layout' }}</span>
              </div>
            </div>
            <FileUpload
              mode="basic"
              name="payroll"
              accept=".xlsx,.xls"
              :maxFileSize="25000000"
              :customUpload="true"
              chooseLabel="Choose File"
              chooseIcon="pi pi-folder-open"
              @select="pickFile"
            />
          </div>
        </div>
      </div>
    </div>

    <template v-if="reconciliation">
      <div class="metric-grid reconcile-metrics">
        <MetricTile label="Verified" :value="reconciliation.summary.verified" icon="pi pi-check-circle" tone="emerald" />
        <MetricTile label="Payroll Only" :value="reconciliation.summary.payrollOnly" icon="pi pi-file" tone="rose" />
        <MetricTile
          :label="form.releaseMode === 'UPDATE' ? 'Ignored' : 'Master Only'"
          :value="form.releaseMode === 'UPDATE' ? reconciliation.summary.ignoredMaster : reconciliation.summary.masterOnly"
          icon="pi pi-users"
          tone="amber"
        />
        <MetricTile label="Mismatch" :value="reconciliation.summary.mismatch" icon="pi pi-exclamation-triangle" tone="rose" />
      </div>

      <div class="surface-panel">
        <div class="app-toolbar">
          <div class="toolbar-left">
            <Tag value="Release Blocked" severity="danger" icon="pi pi-lock" />
            <span class="toolbar-title">Reconciliation</span>
          </div>
        </div>
        <ReconciliationIssues :issues="reconciliation.issues" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import FileUpload from 'primevue/fileupload'
import Tag from 'primevue/tag'
import MetricTile from '../components/MetricTile.vue'
import ReconciliationIssues from '../components/ReconciliationIssues.vue'
import { api } from '../api/client.js'

const router = useRouter()
const toast = useToast()
const loading = ref(false)
const file = ref(null)
const periods = ref([])
const reconciliation = ref(null)
const availability = ref({})
const availabilityChecked = ref(false)
const availabilityLoading = ref(false)
const availabilityRequest = ref(0)
const now = new Date()
const form = reactive({
  releaseMode: 'FULL', // Safety rule: always default to Full Payroll on a fresh import page.
  staffCategory: 'LOCAL',
  payPeriodId: '',
  year: now.getFullYear(),
  month: now.getMonth() + 1
})

const categories = [
  { label: 'Local Staff', value: 'LOCAL' },
  { label: 'Foreigner', value: 'FOREIGNER' }
]
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2020, i, 1))
}))
const activePeriods = computed(() => periods.value.filter((item) => item.active))
const updateAllowed = computed(() => Boolean(availability.value?.updateAllowed))

function pickFile(event) {
  file.value = event.files?.[0] || null
  reconciliation.value = null
}
function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function errorDetail(error) {
  const body = error.response?.data
  if (Array.isArray(body?.details) && body.details.length) {
    const first = body.details.slice(0, 3).map((x) => `Row ${x.row || '-'} Col ${x.column || '-'}: ${x.message || `${x.expected} → ${x.actual}`}`).join(' | ')
    return `${body.message}: ${first}`
  }
  return body?.message || error.message
}

function selectReleaseMode(mode) {
  form.releaseMode = mode
  reconciliation.value = null
  if (mode === 'UPDATE') checkUpdateAvailability()
}

function onCategoryChange() {
  // Never carry Update mode silently into another employee category.
  form.releaseMode = 'FULL'
  form.payPeriodId = ''
  reconciliation.value = null
  availability.value = {}
  availabilityChecked.value = false
}

async function checkUpdateAvailability() {
  if (form.releaseMode !== 'UPDATE') return
  if (form.staffCategory === 'LOCAL' && !form.payPeriodId) {
    availability.value = { updateAllowed: false }
    availabilityChecked.value = false
    return
  }

  const requestId = ++availabilityRequest.value
  availabilityLoading.value = true
  try {
    const { data } = await api.get('/payroll/release-mode-availability', {
      params: {
        staffCategory: form.staffCategory,
        year: form.year,
        month: form.month,
        ...(form.staffCategory === 'LOCAL' ? { payPeriodId: form.payPeriodId } : {})
      }
    })
    if (requestId !== availabilityRequest.value) return
    availability.value = data
    availabilityChecked.value = true
  } catch {
    if (requestId !== availabilityRequest.value) return
    availability.value = { updateAllowed: false }
    availabilityChecked.value = true
  } finally {
    if (requestId === availabilityRequest.value) availabilityLoading.value = false
  }
}

async function submit() {
  if (!file.value) return toast.add({ severity: 'warn', summary: 'Choose payroll file', life: 2500 })
  if (form.staffCategory === 'LOCAL' && !form.payPeriodId) return toast.add({ severity: 'warn', summary: 'Select pay period', life: 2500 })

  if (form.releaseMode === 'UPDATE') {
    await checkUpdateAvailability()
    if (!updateAllowed.value) {
      return toast.add({
        severity: 'warn',
        summary: 'Correction not available',
        detail: 'Release the Full Payroll for this exact period first.',
        life: 4500
      })
    }
  }

  loading.value = true
  reconciliation.value = null
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('releaseMode', form.releaseMode)
    fd.append('staffCategory', form.staffCategory)
    fd.append('year', String(form.year))
    fd.append('month', String(form.month))
    if (form.staffCategory === 'LOCAL') fd.append('payPeriodId', form.payPeriodId)

    const { data } = await api.post('/payroll/import', fd, { timeout: 0 })
    toast.add({
      severity: 'success',
      summary: form.releaseMode === 'UPDATE' ? 'Correction payroll loaded' : 'Payroll loaded',
      detail: `${data.session.employeeCount} employees · memory only`,
      life: 2600
    })
    router.push(`/payroll/preview/${data.session.id}`)
  } catch (error) {
    const result = error.response?.data?.details?.reconciliation
    if (result) {
      reconciliation.value = result
      toast.add({
        severity: 'error',
        summary: 'Reconciliation required',
        detail: form.releaseMode === 'UPDATE'
          ? 'Fix every employee included in this correction file and import again.'
          : 'Fix all payroll/master differences and import again.',
        life: 5000
      })
    } else {
      toast.add({ severity: 'error', summary: 'Import failed', detail: errorDetail(error), life: 8000 })
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [form.staffCategory, form.year, form.month, form.payPeriodId],
  () => {
    reconciliation.value = null
    if (form.releaseMode === 'UPDATE') checkUpdateAvailability()
  }
)

onMounted(async () => {
  const { data } = await api.get('/pay-periods')
  periods.value = data.items
})
</script>

<style scoped>
.import-panel {
  max-width: 960px;
}
.import-body {
  padding: 18px;
}
.release-mode-block {
  margin-bottom: 18px;
}
.release-mode-label {
  display: block;
  margin-bottom: 8px;
}
.release-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.release-mode-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  min-height: 78px;
  padding: 12px 14px;
  border: 1px solid #dde4ec;
  border-radius: 10px;
  background: #fff;
  color: #263449;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.release-mode-card:hover {
  border-color: #aab8c8;
}
.release-mode-card.selected {
  border-color: #10b981;
  background: #f5fffb;
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.12);
}
.mode-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: #eef5ff;
  color: #3b82f6;
}
.mode-icon.update {
  background: #fff7e8;
  color: #d97706;
}
.mode-copy {
  display: grid;
  gap: 3px;
}
.mode-copy strong {
  font-size: 12.5px;
}
.mode-copy small {
  color: #6c7889;
  font-size: 10.5px;
  line-height: 1.35;
}
.mode-check {
  color: #10b981;
  font-size: 17px;
}
.correction-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #f2d59b;
  border-radius: 8px;
  background: #fffbeb;
  color: #865b09;
}
.correction-notice.blocked {
  border-color: #fecaca;
  background: #fff7f7;
  color: #b42318;
}
.correction-notice > i {
  margin-top: 2px;
}
.correction-notice div {
  display: grid;
  gap: 2px;
}
.correction-notice strong {
  font-size: 11px;
}
.correction-notice span {
  font-size: 10.5px;
  line-height: 1.4;
}
.file-area {
  margin-top: 16px;
}
.reconcile-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 900px) {
  .release-mode-grid,
  .reconcile-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .release-mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
