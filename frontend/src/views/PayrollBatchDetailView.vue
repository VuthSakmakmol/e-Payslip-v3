<template>
  <div class="page-stack">
    <div v-if="reconciliation" class="metric-grid reconcile-metrics">
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
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            rounded
            v-tooltip.top="'Back'"
            @click="$router.push('/payroll/batches')"
          />
          <Tag
            v-if="batch"
            :value="batch.status"
            :severity="batch.status === 'RELEASED' ? 'success' : 'info'"
          />
          <Tag
            v-if="reconciliation"
            :value="reconciliation.clean ? 'Verified' : 'Blocked'"
            :severity="reconciliation.clean ? 'success' : 'danger'"
            :icon="reconciliation.clean ? 'pi pi-check-circle' : 'pi pi-lock'"
          />
        </div>
        <div class="toolbar-right">
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            text
            rounded
            :loading="reconLoading"
            v-tooltip.top="'Recheck'"
            @click="loadReconciliation"
          />
          <Button
            label="Release"
            icon="pi pi-send"
            :disabled="batch?.status !== 'READY' || !reconciliation?.clean"
            :loading="releasing"
            @click="confirmRelease"
          />
        </div>
      </div>

      <DataTable
        :value="records"
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
        <template #empty
          ><div class="empty-state">
            <i class="pi pi-table" /><strong>No payroll records</strong>
          </div></template
        >
        <Column header="Employee" style="min-width: 230px">
          <template #body="{ data }">
            <div class="stack-cell">
              <strong>{{
                raw(data, "employeeName") || data.employeeCode
              }}</strong
              ><span>{{ data.employeeCode }}</span>
            </div>
          </template>
        </Column>
        <Column header="Match" style="width: 130px">
          <template #body="{ data }"
            ><Tag
              :value="statusLabel(matchStatus(data.employeeCode))"
              :severity="statusSeverity(matchStatus(data.employeeCode))"
          /></template>
        </Column>
        <Column header="Basic Wage"
          ><template #body="{ data }">{{
            raw(data, "basicWage") || "—"
          }}</template></Column
        >
        <Column header="Gross"
          ><template #body="{ data }">{{
            raw(data, "grossPayBeforeDeduct") || "—"
          }}</template></Column
        >
        <Column header="Actual Wages"
          ><template #body="{ data }"
            ><strong>{{ raw(data, "actualWages") || "—" }}</strong></template
          ></Column
        >
        <Column header="Actions" style="width: 110px">
          <template #body="{ data }">
            <div class="row-actions">
              <Button
                icon="pi pi-list"
                severity="secondary"
                text
                rounded
                v-tooltip.top="'Payroll details'"
                @click="openDetails(data)"
              />
              <Button
                icon="pi pi-file-pdf"
                text
                rounded
                v-tooltip.top="'Preview PDF'"
                @click="previewRecord(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <div v-if="reconciliation?.issues?.length" class="surface-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">Reconciliation</span
          ><Tag
            :value="`${reconciliation.issues.length} Issues`"
            severity="danger"
          />
        </div>
      </div>
      <ReconciliationIssues :issues="reconciliation.issues" />
    </div>

    <div v-if="previewUrl" class="surface-panel preview-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">PDF Preview</span>
        </div>
        <div class="toolbar-right">
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            @click="revoke"
          />
        </div>
      </div>
      <iframe :src="previewUrl" class="preview-frame" />
    </div>
  </div>

  <Drawer
    v-model:visible="detailDrawer"
    position="right"
    header="Payroll Details"
    :style="{ width: '520px', maxWidth: '96vw' }"
  >
    <div v-if="detailRecord" class="detail-head">
      <Avatar
        :label="initials(raw(detailRecord, 'employeeName'))"
        shape="circle"
        size="large"
      />
      <div class="identity-copy">
        <strong>{{ raw(detailRecord, "employeeName") }}</strong
        ><span>{{ detailRecord.employeeCode }}</span>
      </div>
      <Button
        icon="pi pi-file-pdf"
        text
        rounded
        v-tooltip.left="'Preview PDF'"
        @click="previewRecord(detailRecord)"
      />
    </div>

    <div class="payroll-groups">
      <section
        v-for="group in groupedFields"
        :key="group.name"
        class="payroll-group"
      >
        <div class="payroll-group-title">{{ group.name }}</div>
        <div
          v-for="field in group.fields"
          :key="field.key"
          class="payroll-line"
        >
          <span>{{ field.label || field.header || field.key }}</span>
          <strong>{{ raw(detailRecord, field.key) || "—" }}</strong>
        </div>
      </section>
    </div>
  </Drawer>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Drawer from "primevue/drawer";
import Tag from "primevue/tag";
import Avatar from "primevue/avatar";
import MetricTile from "../components/MetricTile.vue";
import ReconciliationIssues from "../components/ReconciliationIssues.vue";
import { api } from "../api/client.js";

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const records = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const previewUrl = ref("");
const batch = ref(null);
const releasing = ref(false);
const reconLoading = ref(false);
const reconciliation = ref(null);
const detailDrawer = ref(false);
const detailRecord = ref(null);
const payrollFields = ref([]);

function raw(row, key) {
  return row?.values?.[key]?.raw ?? "";
}
function initials(name) {
  return (
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}
function revoke() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = "";
  }
}
function statusLabel(status) {
  if (status === "PAYROLL_ONLY") return "Payroll Only";
  if (status === "MASTER_ONLY") return "Master Only";
  if (status === "MISMATCH") return "Mismatch";
  return "Verified";
}
function statusSeverity(status) {
  return status === "VERIFIED"
    ? "success"
    : status === "MASTER_ONLY"
      ? "warn"
      : "danger";
}
function matchStatus(employeeCode) {
  return (
    reconciliation.value?.rows?.find(
      (item) => item.employeeCode === employeeCode,
    )?.status || "VERIFIED"
  );
}

const groupedFields = computed(() => {
  if (!detailRecord.value) return [];
  const map = new Map();
  for (const field of payrollFields.value) {
    const value = raw(detailRecord.value, field.key);
    if (
      value === "" &&
      !Object.prototype.hasOwnProperty.call(
        detailRecord.value.values || {},
        field.key,
      )
    )
      continue;
    const name = field.group || field.category || "Other";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(field);
  }
  return [...map.entries()].map(([name, fields]) => ({
    name: titleCase(name),
    fields,
  }));
});
function titleCase(value) {
  return String(value || "Other")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

async function load(p = 1) {
  loading.value = true;
  try {
    page.value = p;
    const { data } = await api.get(
      `/payroll/batches/${route.params.id}/records`,
      { params: { page: p, limit: 10 } },
    );
    records.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}
async function loadBatch() {
  const { data } = await api.get(`/payroll/batches/${route.params.id}`);
  batch.value = data.item;
}
async function loadFields() {
  try {
    const { data } = await api.get("/payslips/fields");
    payrollFields.value = data.items || [];
  } catch {
    payrollFields.value = [];
  }
}
async function loadReconciliation() {
  reconLoading.value = true;
  try {
    const { data } = await api.get(
      `/payroll/batches/${route.params.id}/reconciliation`,
    );
    reconciliation.value = data.reconciliation;
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Reconciliation",
      detail: error.response?.data?.message || error.message,
      life: 4500,
    });
  } finally {
    reconLoading.value = false;
  }
}
function openDetails(row) {
  detailRecord.value = row;
  detailDrawer.value = true;
}
async function previewRecord(row) {
  if (!row) return;
  revoke();
  const response = await api.get(
    `/payroll/batches/${route.params.id}/preview/${encodeURIComponent(row.employeeCode)}`,
    { responseType: "blob" },
  );
  previewUrl.value = URL.createObjectURL(response.data);
}
function confirmRelease() {
  confirm.require({
    header: "Release Payslips",
    message: "Release this payroll batch?",
    icon: "pi pi-send",
    rejectLabel: "Cancel",
    acceptLabel: "Release",
    accept: release,
  });
}
async function release() {
  releasing.value = true;
  try {
    const { data } = await api.post(
      `/payroll/batches/${route.params.id}/release`,
    );
    const failed = data.deliveries.filter((x) => x.status === "FAILED").length;
    toast.add({
      severity: failed ? "warn" : "success",
      summary: "Payroll released",
      detail: failed
        ? `${failed} delivery attempt(s) failed.`
        : "Delivered successfully",
      life: 5000,
    });
    await Promise.all([loadBatch(), loadReconciliation()]);
  } catch (error) {
    const result = error.response?.data?.details?.reconciliation;
    if (result) reconciliation.value = result;
    toast.add({
      severity: "error",
      summary: "Release failed",
      detail: error.response?.data?.message || error.message,
      life: 6000,
    });
  } finally {
    releasing.value = false;
  }
}
function onPage(e) {
  load(e.page + 1);
}
onMounted(async () => {
  await Promise.all([load(), loadBatch(), loadFields(), loadReconciliation()]);
});
onBeforeUnmount(revoke);
</script>

<style scoped>
.reconcile-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.payroll-drawer {
  width: min(520px, 96vw) !important;
}
.detail-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf1f5;
}
.payroll-groups {
  display: grid;
  gap: 14px;
  padding-top: 12px;
}
.payroll-group-title {
  color: #778397;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 3px;
}
.payroll-line {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #f0f3f6;
}
.payroll-line span {
  color: #667386;
  font-size: 11px;
}
.payroll-line strong {
  color: #263449;
  font-size: 11.5px;
  text-align: right;
}
@media (max-width: 900px) {
  .reconcile-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
