<template>
  <DataTable
    :value="issues || []"
    paginator
    :rows="10"
    size="small"
    class="app-table reconciliation-table"
    dataKey="employeeCode"
    rowHover
  >
    <template #empty>
      <div class="empty-state">
        <i class="pi pi-check-circle" /><strong>No issues</strong>
      </div>
    </template>

    <Column header="Employee" style="min-width: 210px">
      <template #body="{ data }">
        <div class="stack-cell">
          <strong>{{ data.employeeName || "—" }}</strong>
          <span>{{ data.employeeCode || "—" }}</span>
        </div>
      </template>
    </Column>

    <Column header="Status" style="width: 150px">
      <template #body="{ data }">
        <Tag
          :value="statusLabel(data.status)"
          :severity="statusSeverity(data.status)"
        />
      </template>
    </Column>

    <Column header="Employee ID" style="width: 115px; text-align: center">
      <template #body="{ data }"
        ><FieldState :field="field(data, 'employeeCode')"
      /></template>
    </Column>
    <Column header="Date Join" style="width: 105px; text-align: center">
      <template #body="{ data }"
        ><FieldState :field="field(data, 'dateJoin')"
      /></template>
    </Column>
    <Column header="Department" style="width: 115px; text-align: center">
      <template #body="{ data }"
        ><FieldState :field="field(data, 'department')"
      /></template>
    </Column>
    <Column header="Position" style="width: 105px; text-align: center">
      <template #body="{ data }"
        ><FieldState :field="field(data, 'position')"
      /></template>
    </Column>

    <Column header="" style="width: 58px">
      <template #body="{ data }">
        <Button
          icon="pi pi-eye"
          severity="secondary"
          text
          rounded
          v-tooltip.left="'Compare'"
          @click="open(data)"
        />
      </template>
    </Column>
  </DataTable>

  <Drawer
    v-model:visible="drawer"
    position="right"
    header="Identity Check"
    :style="{ width: '640px', maxWidth: '96vw' }"
  >
    <template v-if="selected">
      <div class="identity-head">
        <div class="identity-avatar"><i class="pi pi-user" /></div>
        <div class="identity-copy">
          <strong>{{ selected.employeeName || "—" }}</strong>
          <span>{{ selected.employeeCode || "—" }}</span>
        </div>
        <Tag
          :value="statusLabel(selected.status)"
          :severity="statusSeverity(selected.status)"
        />
      </div>

      <div class="compare-header compare-grid">
        <span>Field</span>
        <strong><i class="pi pi-file-excel" /> Payroll</strong>
        <strong><i class="pi pi-users" /> Employee Master</strong>
        <span>Result</span>
      </div>

      <div
        v-for="item in displayFields"
        :key="item.field"
        class="compare-row compare-grid"
      >
        <strong class="field-name">{{ item.label }}</strong>
        <div class="compare-value" :class="{ bad: !item.match }">
          {{ value(item.payroll) }}
        </div>
        <div class="compare-value" :class="{ bad: !item.match }">
          {{ value(item.master) }}
        </div>
        <div class="result-icon">
          <i v-if="item.match" class="pi pi-check-circle ok" />
          <i v-else class="pi pi-times-circle fail" />
        </div>
      </div>

      <div v-if="extraFields.length" class="extra-checks">
        <div
          v-for="item in extraFields"
          :key="item.field"
          class="compare-row compare-grid"
        >
          <strong class="field-name">{{ item.label }}</strong>
          <div class="compare-value" :class="{ bad: !item.match }">
            {{ value(item.payroll) }}
          </div>
          <div class="compare-value" :class="{ bad: !item.match }">
            {{ value(item.master) }}
          </div>
          <div class="result-icon">
            <i v-if="item.match" class="pi pi-check-circle ok" />
            <i v-else class="pi pi-times-circle fail" />
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>

<script setup>
import { computed, defineComponent, h, ref } from "vue";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import Tag from "primevue/tag";

const props = defineProps({
  issues: { type: Array, default: () => [] },
});

const drawer = ref(false);
const selected = ref(null);
const strictFields = [
  { field: "employeeCode", label: "Employee ID" },
  { field: "dateJoin", label: "Date Join" },
  { field: "department", label: "Department" },
  { field: "position", label: "Position" },
];

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

function field(issue, key) {
  return (issue?.fields || []).find((item) => item.field === key) || null;
}

function value(input) {
  const text = String(input ?? "").trim();
  return text || "—";
}

function open(issue) {
  selected.value = issue;
  drawer.value = true;
}

const displayFields = computed(() =>
  strictFields.map((definition) => {
    const existing = field(selected.value, definition.field);
    return existing || { ...definition, payroll: "", master: "", match: false };
  }),
);

const extraFields = computed(() => {
  const strict = new Set(strictFields.map((item) => item.field));
  return (selected.value?.fields || []).filter(
    (item) => !strict.has(item.field),
  );
});

const FieldState = defineComponent({
  props: { field: { type: Object, default: null } },
  setup(fieldProps) {
    return () => {
      if (!fieldProps.field)
        return h("span", { class: "field-state neutral" }, "—");
      const icon = fieldProps.field.match
        ? "pi pi-check-circle"
        : "pi pi-times-circle";
      const cls = fieldProps.field.match
        ? "field-state ok"
        : "field-state fail";
      const title = `Payroll: ${value(fieldProps.field.payroll)} | Employee Master: ${value(fieldProps.field.master)}`;
      return h("i", { class: `${icon} ${cls}`, title });
    };
  },
});
</script>

<style scoped>
.reconciliation-table :deep(.p-datatable-tbody > tr) {
  cursor: default;
}
.field-state {
  font-size: 15px;
}
.field-state.ok,
.ok {
  color: #16a34a;
}
.field-state.fail,
.fail {
  color: #dc2626;
}
.field-state.neutral {
  color: #94a3b8;
  font-weight: 700;
}
.identity-head {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e8edf3;
}
.identity-avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #f1f5f9;
  color: #334155;
  font-size: 17px;
}
.identity-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.identity-copy strong {
  color: #172033;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity-copy span {
  color: #778397;
  font-size: 11px;
}
.compare-grid {
  display: grid;
  grid-template-columns: minmax(105px, 0.8fr) minmax(145px, 1.25fr) minmax(
      145px,
      1.25fr
    ) 54px;
  gap: 10px;
  align-items: center;
}
.compare-header {
  margin-top: 18px;
  padding: 9px 10px;
  border-radius: 9px;
  background: #f7f9fc;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.compare-header strong {
  color: #334155;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.compare-row {
  min-height: 52px;
  padding: 8px 10px;
  border-bottom: 1px solid #edf1f5;
}
.field-name {
  color: #475569;
  font-size: 11px;
}
.compare-value {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #263449;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.compare-value.bad {
  border-color: #fecaca;
  background: #fff7f7;
  color: #991b1b;
}
.result-icon {
  text-align: center;
  font-size: 17px;
}
.extra-checks {
  margin-top: 12px;
  border-top: 1px solid #e8edf3;
}
@media (max-width: 620px) {
  .compare-grid {
    grid-template-columns: 95px minmax(0, 1fr) minmax(0, 1fr) 34px;
    gap: 6px;
  }
  .compare-header,
  .compare-row {
    padding-left: 4px;
    padding-right: 4px;
  }
}
</style>
