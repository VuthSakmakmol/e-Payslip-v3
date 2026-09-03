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
          @click="load"
        />
      </div>
      <div class="toolbar-right">
        <Button label="Add Pay Period" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <DataTable :value="items" size="small" class="app-table" dataKey="_id">
      <template #empty
        ><div class="empty-state">
          <i class="pi pi-calendar" /><strong>No pay periods</strong>
        </div></template
      >
      <Column field="code" header="Code" style="width: 130px" />
      <Column field="name" header="Name" />
      <Column field="sequence" header="Sequence" style="width: 110px" />
      <Column header="Status" style="width: 120px"
        ><template #body="{ data }"
          ><Tag
            :value="data.active ? 'Active' : 'Inactive'"
            :severity="data.active ? 'success' : 'secondary'" /></template
      ></Column>
      <Column header="Actions" style="width: 80px"
        ><template #body="{ data }"
          ><Button
            icon="pi pi-pencil"
            severity="secondary"
            text
            rounded
            v-tooltip.top="'Edit'"
            @click="openEdit(data)" /></template
      ></Column>
    </DataTable>
  </div>

  <Dialog
    v-model:visible="dialog"
    modal
    :header="form._id ? 'Edit Pay Period' : 'Add Pay Period'"
    :style="{ width: '430px', maxWidth: 'calc(100vw - 28px)' }"
  >
    <div class="form-grid one-column">
      <div class="form-field">
        <label class="required">Code</label
        ><InputText v-model.trim="form.code" />
      </div>
      <div class="form-field">
        <label class="required">Name</label
        ><InputText v-model.trim="form.name" />
      </div>
      <div class="form-field">
        <label class="required">Sequence</label
        ><InputNumber v-model="form.sequence" :min="1" />
      </div>
      <div class="form-field">
        <label>Status</label>
        <div class="compact-switch">
          <ToggleSwitch v-model="form.active" /><span>{{
            form.active ? "Active" : "Inactive"
          }}</span>
        </div>
      </div>
    </div>
    <template #footer
      ><Button
        label="Cancel"
        severity="secondary"
        text
        @click="dialog = false" /><Button
        label="Save"
        icon="pi pi-check"
        @click="save"
    /></template>
  </Dialog>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Dialog from "primevue/dialog";
import Tag from "primevue/tag";
import { api } from "../api/client.js";

const toast = useToast();
const items = ref([]);
const dialog = ref(false);
const form = reactive({
  _id: "",
  code: "",
  name: "",
  sequence: 1,
  active: true,
});
function openCreate() {
  Object.assign(form, {
    _id: "",
    code: "",
    name: "",
    sequence: items.value.length + 1,
    active: true,
  });
  dialog.value = true;
}
function openEdit(row) {
  Object.assign(form, row);
  dialog.value = true;
}
async function load() {
  const { data } = await api.get("/pay-periods");
  items.value = data.items;
}
async function save() {
  try {
    if (form._id) await api.put(`/pay-periods/${form._id}`, form);
    else await api.post("/pay-periods", form);
    dialog.value = false;
    toast.add({ severity: "success", summary: "Saved", life: 2000 });
    await load();
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Cannot save",
      detail: error.response?.data?.message || error.message,
      life: 4500,
    });
  }
}
onMounted(load);
</script>

<style scoped>
.one-column {
  grid-template-columns: 1fr;
}
</style>
