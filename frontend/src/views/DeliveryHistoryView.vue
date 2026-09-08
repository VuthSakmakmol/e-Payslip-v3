<template>
  <div class="surface-panel">
    <div class="app-toolbar">
      <div class="toolbar-left">
        <Select
          v-model="status"
          :options="statuses"
          optionLabel="label"
          optionValue="value"
          class="filter-select"
          @change="load(1)"
        />
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          v-tooltip.top="'Refresh'"
          @click="load(page)"
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
    >
      <template #empty
        ><div class="empty-state">
          <i class="pi pi-send" /><strong>No delivery history</strong>
        </div></template
      >
      <Column header="Employee" style="min-width: 160px">
        <template #body="{ data }"
          ><div class="stack-cell">
            <strong>{{ data.employeeCode }}</strong
            ><span>{{ data.staffCategory }}</span>
          </div></template
        >
      </Column>
      <Column header="Period" style="min-width: 180px">
        <template #body="{ data }"
          ><div class="stack-cell">
            <strong>{{ monthName(data.month) }} {{ data.year }}</strong
            ><span>{{ data.payPeriodId?.name || "—" }}</span>
          </div></template
        >
      </Column>
      <Column header="Release" style="min-width: 145px">
        <template #body="{ data }">
          <Tag
            :value="releaseLabel(data)"
            :severity="(data.releaseMode || 'FULL') === 'UPDATE' ? 'warn' : 'info'"
          />
        </template>
      </Column>
      <Column header="Channel" style="min-width: 110px">
        <template #body="{ data }"
          ><Tag
            :value="data.channel"
            :severity="data.channel === 'TELEGRAM' ? 'info' : 'secondary'"
        /></template>
      </Column>
      <Column
        field="destinationMasked"
        header="Destination"
        style="min-width: 210px"
      />
      <Column header="Status" style="width: 110px">
        <template #body="{ data }"
          ><Tag
            :value="data.status"
            :severity="data.status === 'SENT' ? 'success' : 'danger'"
        /></template>
      </Column>
      <Column field="errorMessage" header="Error" style="min-width: 220px" />
      <Column header="Time" style="min-width: 160px"
        ><template #body="{ data }">{{
          formatDate(data.createdAt)
        }}</template></Column
      >
    </DataTable>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import Button from "primevue/button";
import Select from "primevue/select";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Tag from "primevue/tag";
import { api } from "../api/client.js";

const items = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const status = ref("");
const statuses = [
  { label: "All Statuses", value: "" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
];
const monthName = (m) =>
  new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2020, m - 1, 1),
  );
const formatDate = (v) => (v ? new Date(v).toLocaleString() : "—");
function releaseLabel(item) {
  const mode = item?.releaseMode || "FULL";
  return mode === "UPDATE"
    ? `Update #${item?.correctionNumber || 1}`
    : "Full Payroll";
}
async function load(p = 1) {
  loading.value = true;
  try {
    page.value = p;
    const { data } = await api.get("/deliveries", {
      params: { page: p, limit: 10, status: status.value },
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
