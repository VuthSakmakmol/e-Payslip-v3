<template>
  <div class="page-stack">
    <div class="surface-panel import-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <Tag
            :value="
              form.staffCategory === 'LOCAL' ? 'Stored Payroll' : 'Memory Only'
            "
            :severity="form.staffCategory === 'LOCAL' ? 'success' : 'warn'"
          />
        </div>
        <div class="toolbar-right">
          <Button
            label="Import"
            icon="pi pi-upload"
            :loading="loading"
            @click="submit"
          />
        </div>
      </div>

      <div class="surface-body import-body">
        <div class="form-grid">
          <div class="form-field">
            <label class="required">Employee Category</label>
            <Select
              v-model="form.staffCategory"
              :options="categories"
              optionLabel="label"
              optionValue="value"
              @change="reconciliation = null"
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
                <strong>{{ file?.name || "Payroll XLSX" }}</strong>
                <span>{{
                  file ? formatSize(file.size) : "87-column company layout"
                }}</span>
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
        <MetricTile
          label="Verified"
          :value="reconciliation.summary.verified"
          icon="pi pi-check-circle"
          tone="emerald"
        />
        <MetricTile
          label="Payroll Only"
          :value="reconciliation.summary.payrollOnly"
          icon="pi pi-file"
          tone="rose"
        />
        <MetricTile
          label="Master Only"
          :value="reconciliation.summary.masterOnly"
          icon="pi pi-users"
          tone="amber"
        />
        <MetricTile
          label="Mismatch"
          :value="reconciliation.summary.mismatch"
          icon="pi pi-exclamation-triangle"
          tone="rose"
        />
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
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import FileUpload from "primevue/fileupload";
import Tag from "primevue/tag";
import MetricTile from "../components/MetricTile.vue";
import ReconciliationIssues from "../components/ReconciliationIssues.vue";
import { api } from "../api/client.js";

const router = useRouter();
const toast = useToast();
const loading = ref(false);
const file = ref(null);
const periods = ref([]);
const reconciliation = ref(null);
const now = new Date();
const form = reactive({
  staffCategory: "LOCAL",
  payPeriodId: "",
  year: now.getFullYear(),
  month: now.getMonth() + 1,
});
const categories = [
  { label: "Local Staff", value: "LOCAL" },
  { label: "Foreigner", value: "FOREIGNER" },
];
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2020, i, 1),
  ),
}));
const activePeriods = computed(() =>
  periods.value.filter((item) => item.active),
);

function pickFile(event) {
  file.value = event.files?.[0] || null;
  reconciliation.value = null;
}
function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function errorDetail(error) {
  const body = error.response?.data;
  if (Array.isArray(body?.details) && body.details.length) {
    const first = body.details
      .slice(0, 3)
      .map(
        (x) =>
          `Row ${x.row || "-"} Col ${x.column || "-"}: ${x.message || `${x.expected} → ${x.actual}`}`,
      )
      .join(" | ");
    return `${body.message}: ${first}`;
  }
  return body?.message || error.message;
}

async function submit() {
  if (!file.value)
    return toast.add({
      severity: "warn",
      summary: "Choose payroll file",
      life: 2500,
    });
  if (form.staffCategory === "LOCAL" && !form.payPeriodId)
    return toast.add({
      severity: "warn",
      summary: "Select pay period",
      life: 2500,
    });

  loading.value = true;
  reconciliation.value = null;
  try {
    const fd = new FormData();
    fd.append("file", file.value);
    fd.append("staffCategory", form.staffCategory);
    fd.append("year", String(form.year));
    fd.append("month", String(form.month));
    if (form.staffCategory === "LOCAL")
      fd.append("payPeriodId", form.payPeriodId);

    const { data } = await api.post("/payroll/import", fd);
    if (data.mode === "TRANSIENT") {
      toast.add({ severity: "success", summary: "Payroll loaded", life: 2200 });
      router.push(`/payroll/foreigner/${data.session.id}`);
    } else {
      toast.add({
        severity: "success",
        summary: "Payroll imported",
        detail: `${data.batch.employeeCount} employees`,
        life: 2500,
      });
      router.push(`/payroll/batches/${data.batch._id}`);
    }
  } catch (error) {
    const result = error.response?.data?.details?.reconciliation;
    if (result) {
      reconciliation.value = result;
      toast.add({
        severity: "error",
        summary: "Reconciliation required",
        detail: "Fix all payroll/master differences and import again.",
        life: 5000,
      });
    } else {
      toast.add({
        severity: "error",
        summary: "Import failed",
        detail: errorDetail(error),
        life: 8000,
      });
    }
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const { data } = await api.get("/pay-periods");
  periods.value = data.items;
});
</script>

<style scoped>
.import-panel {
  max-width: 860px;
}
.import-body {
  padding: 18px;
}
.file-area {
  margin-top: 16px;
}
.reconcile-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 900px) {
  .reconcile-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
