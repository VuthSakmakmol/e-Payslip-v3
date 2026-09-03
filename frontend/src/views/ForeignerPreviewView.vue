<template>
  <div class="page-stack">
    <div v-if="session?.reconciliation" class="metric-grid reconcile-metrics">
      <MetricTile
        label="Verified"
        :value="session.reconciliation.summary.verified"
        icon="pi pi-check-circle"
        tone="emerald"
      />
      <MetricTile
        label="Payroll Only"
        :value="session.reconciliation.summary.payrollOnly"
        icon="pi pi-file"
        tone="rose"
      />
      <MetricTile
        label="Master Only"
        :value="session.reconciliation.summary.masterOnly"
        icon="pi pi-users"
        tone="amber"
      />
      <MetricTile
        label="Mismatch"
        :value="session.reconciliation.summary.mismatch"
        icon="pi pi-exclamation-triangle"
        tone="rose"
      />
    </div>

    <div class="surface-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <Tag
            :value="session?.approved ? 'Approved' : 'Preview Required'"
            :severity="session?.approved ? 'success' : 'warn'"
          />
          <Tag
            v-if="session"
            :value="`${session.employeeCount} Employees`"
            severity="secondary"
          />
          <Tag value="Memory Only" severity="info" />
          <Tag
            v-if="session?.reconciliation"
            :value="session.reconciliation.clean ? 'Verified' : 'Blocked'"
            :severity="session.reconciliation.clean ? 'success' : 'danger'"
            :icon="
              session.reconciliation.clean ? 'pi pi-check-circle' : 'pi pi-lock'
            "
          />
        </div>
        <div class="toolbar-right">
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            text
            rounded
            v-tooltip.top="'Recheck'"
            @click="load"
          />
          <Button
            label="Approve"
            icon="pi pi-check"
            severity="secondary"
            outlined
            :disabled="
              !session || session.approved || !session.reconciliation?.clean
            "
            @click="approve"
          />
          <Button
            label="Release"
            icon="pi pi-send"
            :disabled="!session?.approved || !session?.reconciliation?.clean"
            :loading="releasing"
            @click="confirmRelease"
          />
        </div>
      </div>

      <DataTable
        :value="session?.rows || []"
        size="small"
        paginator
        :rows="10"
        class="app-table"
        dataKey="employeeCode"
      >
        <template #empty
          ><div class="empty-state">
            <i class="pi pi-users" /><strong>No employees</strong>
          </div></template
        >
        <Column header="Employee" style="min-width: 220px">
          <template #body="{ data }"
            ><div class="stack-cell">
              <strong>{{ data.employeeName }}</strong
              ><span>{{ data.employeeCode }}</span>
            </div></template
          >
        </Column>
        <Column header="Match" style="width: 130px">
          <template #body="{ data }"
            ><Tag
              :value="statusLabel(matchStatus(data.employeeCode))"
              :severity="statusSeverity(matchStatus(data.employeeCode))"
          /></template>
        </Column>
        <Column header="Delivery" style="min-width: 180px">
          <template #body="{ data }"
            ><Tag
              :value="data.employee?.preferredDelivery || '—'"
              :severity="
                data.employee?.preferredDelivery === 'TELEGRAM'
                  ? 'info'
                  : 'secondary'
              "
          /></template>
        </Column>
        <Column header="Actual Wages"
          ><template #body="{ data }"
            ><strong>{{
              data.values?.actualWages?.raw || "—"
            }}</strong></template
          ></Column
        >
        <Column header="Actions" style="width: 90px"
          ><template #body="{ data }"
            ><Button
              icon="pi pi-file-pdf"
              text
              rounded
              v-tooltip.top="'Preview PDF'"
              @click="previewRow(data)" /></template
        ></Column>
      </DataTable>
    </div>

    <div v-if="session?.reconciliation?.issues?.length" class="surface-panel">
      <div class="app-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">Reconciliation</span
          ><Tag
            :value="`${session.reconciliation.issues.length} Issues`"
            severity="danger"
          />
        </div>
      </div>
      <ReconciliationIssues :issues="session.reconciliation.issues" />
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
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import Button from "primevue/button";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import MetricTile from "../components/MetricTile.vue";
import ReconciliationIssues from "../components/ReconciliationIssues.vue";
import { api } from "../api/client.js";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const session = ref(null);
const previewUrl = ref("");
const releasing = ref(false);
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
    session.value?.reconciliation?.rows?.find(
      (item) => item.employeeCode === employeeCode,
    )?.status || "VERIFIED"
  );
}
async function load() {
  const { data } = await api.get(`/payroll/transient/${route.params.id}`);
  session.value = data.session;
}
async function previewRow(row) {
  revoke();
  const response = await api.get(
    `/payroll/transient/${route.params.id}/preview/${encodeURIComponent(row.employeeCode)}`,
    { responseType: "blob" },
  );
  previewUrl.value = URL.createObjectURL(response.data);
}
async function approve() {
  try {
    await api.post(`/payroll/transient/${route.params.id}/approve`);
    await load();
    toast.add({ severity: "success", summary: "Preview approved", life: 2200 });
  } catch (error) {
    const result = error.response?.data?.details?.reconciliation;
    if (result && session.value) session.value.reconciliation = result;
    toast.add({
      severity: "error",
      summary: "Cannot approve",
      detail: error.response?.data?.message || error.message,
      life: 4500,
    });
  }
}
function confirmRelease() {
  confirm.require({
    header: "Release Payslips",
    message: "Release foreigner payslips now?",
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
      `/payroll/transient/${route.params.id}/release`,
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
    router.push("/");
  } catch (error) {
    const result = error.response?.data?.details?.reconciliation;
    if (result && session.value) session.value.reconciliation = result;
    toast.add({
      severity: "error",
      summary: "Release failed",
      detail: error.response?.data?.message || error.message,
      life: 5000,
    });
  } finally {
    releasing.value = false;
  }
}
onMounted(load);
onBeforeUnmount(revoke);
</script>

<style scoped>
.reconcile-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 900px) {
  .reconcile-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
