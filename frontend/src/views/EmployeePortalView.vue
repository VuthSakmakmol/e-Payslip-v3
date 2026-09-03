<template>
  <div class="employee-portal">
    <header class="portal-topbar">
      <div class="portal-brand">
        <span><i class="pi pi-receipt" /></span>
        <strong>e-PaySlip</strong>
      </div>
      <div class="portal-actions">
        <Tag value="Active" severity="success" />
        <Button
          icon="pi pi-sign-out"
          severity="secondary"
          text
          rounded
          v-tooltip.left="'Logout'"
          @click="logout"
        />
      </div>
    </header>

    <main class="portal-main">
      <section class="portal-identity surface-panel">
        <Avatar
          :label="initials(auth.user?.name)"
          shape="circle"
          size="xlarge"
        />
        <div class="identity-copy">
          <strong>{{ auth.user?.name }}</strong>
          <span>{{ auth.user?.employeeCode }}</span>
        </div>
        <div class="portal-tags">
          <Tag :value="auth.user?.staffCategory" severity="secondary" />
          <Tag
            :value="auth.user?.preferredDelivery"
            :severity="
              auth.user?.preferredDelivery === 'TELEGRAM' ? 'info' : 'secondary'
            "
          />
        </div>
      </section>

      <section class="surface-panel payslip-panel">
        <div class="app-toolbar">
          <div class="toolbar-left">
            <span class="toolbar-title">Payslips</span>
            <Tag
              v-if="total"
              :value="String(total)"
              severity="secondary"
              rounded
            />
          </div>
          <div class="toolbar-right">
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              text
              rounded
              :loading="loading"
              v-tooltip.left="'Refresh'"
              @click="load(page)"
            />
          </div>
        </div>

        <DataTable
          v-if="items.length"
          :value="items"
          dataKey="id"
          size="small"
          stripedRows
          class="payslip-table"
        >
          <Column header="Payroll">
            <template #body="{ data }">
              <div class="payroll-cell">
                <strong>{{ data.monthName }} {{ data.year }}</strong>
                <span>{{ data.payPeriod?.name || "Pay Period" }}</span>
              </div>
            </template>
          </Column>

          <Column header="Released" style="width: 180px">
            <template #body="{ data }">
              {{ formatDate(data.releasedAt) }}
            </template>
          </Column>

          <Column header="Status" style="width: 130px">
            <template #body>
              <Tag value="Released" severity="success" />
            </template>
          </Column>

          <Column
            header="Actions"
            style="width: 120px"
            bodyStyle="text-align:right"
          >
            <template #body="{ data }">
              <div class="row-actions">
                <Button
                  icon="pi pi-eye"
                  text
                  rounded
                  v-tooltip.top="'View'"
                  :loading="openingId === data.id"
                  @click="viewPdf(data)"
                />
                <Button
                  icon="pi pi-download"
                  severity="secondary"
                  text
                  rounded
                  v-tooltip.top="'Download'"
                  :loading="downloadingId === data.id"
                  @click="downloadPdf(data)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

        <div v-else-if="!loading && loadError" class="empty-state error-state">
          <i class="pi pi-exclamation-triangle" />
          <strong>{{ loadError }}</strong>
          <Button
            label="Retry"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            outlined
            @click="load(page)"
          />
        </div>

        <div v-else-if="!loading" class="empty-state">
          <i class="pi pi-file-pdf" />
          <strong>No released payslips</strong>
        </div>

        <div v-else class="loading-state">
          <i class="pi pi-spin pi-spinner" />
        </div>

        <Paginator
          v-if="total > limit"
          :first="(page - 1) * limit"
          :rows="limit"
          :totalRecords="total"
          template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
          currentPageReportTemplate="{currentPage} / {totalPages}"
          @page="onPage"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Avatar from "primevue/avatar";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Paginator from "primevue/paginator";
import Tag from "primevue/tag";
import { api } from "../api/client.js";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();

const items = ref([]);
const total = ref(0);
const page = ref(1);
const limit = 10;
const loading = ref(false);
const openingId = ref("");
const downloadingId = ref("");
const loadError = ref("");

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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function logout() {
  auth.logout();
  router.replace("/login");
}

async function load(targetPage = 1) {
  loading.value = true;
  loadError.value = "";
  try {
    const { data } = await api.get("/employee-payslips", {
      params: { page: targetPage, limit },
    });
    items.value = data.items || [];
    total.value = Number(data.total || 0);
    page.value = Number(data.page || targetPage);
  } catch (error) {
    items.value = [];
    total.value = 0;
    loadError.value =
      error.response?.data?.message || error.message || "Cannot load payslips";
  } finally {
    loading.value = false;
  }
}

function onPage(event) {
  load(event.page + 1);
}

async function fetchPdf(item, download = false) {
  const { data } = await api.get(`/employee-payslips/${item.id}/pdf`, {
    params: download ? { download: 1 } : undefined,
    responseType: "blob",
  });
  return data;
}

async function viewPdf(item) {
  openingId.value = item.id;
  const tab = window.open("", "_blank");
  try {
    const blob = await fetchPdf(item, false);
    const url = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (error) {
    if (tab) tab.close();
    throw error;
  } finally {
    openingId.value = "";
  }
}

async function downloadPdf(item) {
  downloadingId.value = item.id;
  try {
    const blob = await fetchPdf(item, true);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const period = String(
      item.payPeriod?.code || item.payPeriod?.name || "period",
    ).replace(/\s+/g, "-");
    anchor.href = url;
    anchor.download = `e-PaySlip-${item.employeeCode}-${item.year}-${String(item.month).padStart(2, "0")}-${period}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    downloadingId.value = "";
  }
}

onMounted(() => load(1));
</script>

<style scoped>
.employee-portal {
  min-height: 100vh;
  background: #f4f7fb;
}
.portal-topbar {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e7ebf1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
}
.portal-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.portal-brand > span {
  width: 31px;
  height: 31px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #0f9f76;
  color: #fff;
}
.portal-brand strong {
  font-size: 16px;
}
.portal-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.portal-main {
  max-width: 980px;
  margin: 0 auto;
  padding: 18px;
  display: grid;
  gap: 12px;
}
.portal-identity {
  min-height: 96px;
  padding: 16px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}
.identity-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.identity-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity-copy span {
  font-size: 12px;
  color: var(--p-text-muted-color);
}
.portal-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.payslip-panel {
  overflow: hidden;
}
.toolbar-left,
.toolbar-right,
.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.payroll-cell {
  display: grid;
  gap: 3px;
}
.payroll-cell span {
  font-size: 12px;
  color: var(--p-text-muted-color);
}
.error-state {
  color: var(--p-red-600);
}
.error-state :deep(.p-button) {
  margin-top: 6px;
}
.loading-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: var(--p-text-muted-color);
  font-size: 20px;
}
:deep(.p-datatable-thead > tr > th) {
  white-space: nowrap;
}
@media (max-width: 650px) {
  .portal-main {
    padding: 12px;
  }
  .portal-identity {
    grid-template-columns: auto 1fr;
  }
  .portal-tags {
    grid-column: 1 / -1;
  }
  :deep(.p-datatable-wrapper) {
    overflow-x: auto;
  }
}
</style>
