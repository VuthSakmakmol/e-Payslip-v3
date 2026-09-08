<template>
  <div class="surface-panel">
    <div class="app-toolbar">
      <div class="toolbar-left">
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          v-tooltip.top="'Refresh'"
          @click="load(page)"
        />
      </div>
      <div class="toolbar-right">
        <Button
          label="Import Payroll"
          icon="pi pi-plus"
          @click="$router.push('/payroll/import')"
        />
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
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-wallet" /><strong>No payroll batches</strong>
        </div>
      </template>

      <Column header="Period" style="min-width: 170px">
        <template #body="{ data }">
          <div class="stack-cell">
            <strong>{{ monthName(data.month) }} {{ data.year }}</strong
            ><span>{{ data.payPeriodId?.name || "—" }}</span>
          </div>
        </template>
      </Column>
      <Column header="Release Type" style="min-width: 150px">
        <template #body="{ data }">
          <Tag
            :value="releaseLabel(data)"
            :severity="(data.releaseMode || 'FULL') === 'UPDATE' ? 'warn' : 'info'"
          />
        </template>
      </Column>
      <Column header="Employees" field="employeeCount" style="width: 120px" />
      <Column header="Status" style="width: 130px">
        <template #body="{ data }"
          ><Tag
            :value="statusLabel(data.status)"
            :severity="statusSeverity(data.status)"
        /></template>
      </Column>
      <Column
        header="Source File"
        field="sourceFileName"
        style="min-width: 240px"
      />
      <Column header="Actions" style="width: 90px">
        <template #body="{ data }">
          <Button
            icon="pi pi-arrow-right"
            text
            rounded
            v-tooltip.top="'Open'"
            @click="$router.push(`/payroll/batches/${data._id}`)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import Button from "primevue/button";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import { api } from "../api/client.js";

const items = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const monthName = (m) =>
  new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2020, m - 1, 1),
  );
function statusLabel(status) {
  return String(status || "").replaceAll("_", " ");
}
function releaseLabel(batch) {
  const mode = batch?.releaseMode || "FULL";
  return mode === "UPDATE"
    ? `Update #${batch?.correctionNumber || 1}`
    : "Full Payroll";
}
function statusSeverity(status) {
  if (status === "RELEASED") return "success";
  if (status === "READY") return "info";
  if (status === "FAILED" || status === "INVALID") return "danger";
  return "warn";
}
async function load(p = page.value) {
  loading.value = true;
  try {
    page.value = p;
    const { data } = await api.get("/payroll/batches", {
      params: { page: p, limit: 10 },
    });
    items.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}
function onPage(e) {
  load(e.page + 1);
}
onMounted(() => load());
</script>
