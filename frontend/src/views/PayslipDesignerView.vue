<template>
  <div class="surface-panel designer-toolbar">
    <div class="toolbar-left">
      <InputText v-model="design.name" placeholder="Design name" style="width:220px" />
      <Select
        v-model="design.pageOrientation"
        :options="orientationOptions"
        optionLabel="label"
        optionValue="value"
        style="width:125px"
      />
      <Tag value="A4" severity="secondary" />
    </div>
    <div class="toolbar-right">
      <Button label="Default" icon="pi pi-file" severity="secondary" outlined @click="confirmDefault" />
      <Button label="Save & Activate" icon="pi pi-save" :loading="saving" @click="saveDesign" />
    </div>
  </div>

  <div class="designer-shell">
    <aside class="designer-side">
      <div class="designer-actions">
        <Button icon="pi pi-plus" label="Text" size="small" severity="secondary" @click="addText" />
        <Button icon="pi pi-minus" label="Line" size="small" severity="secondary" @click="addLine" />
        <Button icon="pi pi-stop" label="Box" size="small" severity="secondary" @click="addRectangle" />
      </div>
      <div v-for="group in groupedFields" :key="group.name" class="field-group">
        <div class="field-group-title">{{ group.name }}</div>
        <div
          v-for="field in group.items"
          :key="field.key"
          class="field-chip"
          draggable="true"
          @dragstart="dragField($event, field)"
        >
          <i class="pi pi-database" />
          <span>{{ field.label }}</span>
        </div>
      </div>
    </aside>

    <section class="canvas-wrap">
      <div
        ref="canvas"
        class="payslip-canvas"
        :class="`is-${design.pageOrientation}`"
        :style="canvasStyle"
        @dragover.prevent
        @drop="dropField"
        @click.self="clearSelection"
      >
        <div
          v-for="element in design.elements"
          :key="element.uiId"
          class="design-element"
          :class="[{ selected: selectedIds.includes(element.uiId) }, element.type === 'LINE' ? 'design-line' : '']"
          :style="elementStyle(element)"
          @pointerdown="startMove($event, element)"
          @click.stop="selectElement($event, element)"
        >
          <template v-if="element.type === 'FIELD'">{{ previewFieldText(element) }}</template>
          <template v-else-if="element.type === 'TEXT'">{{ element.text }}</template>
        </div>
      </div>
    </section>

    <aside class="designer-side">
      <div class="designer-actions">
        <Button icon="pi pi-copy" v-tooltip.top="'Duplicate'" severity="secondary" text :disabled="!selectedIds.length" @click="duplicateSelected" />
        <Button icon="pi pi-palette" v-tooltip.top="'Format Painter'" severity="secondary" text :disabled="!primary" @click="copyFormat" />
        <Button icon="pi pi-link" v-tooltip.top="'Group'" severity="secondary" text :disabled="selectedIds.length < 2" @click="groupSelected" />
        <Button icon="pi pi-times" v-tooltip.top="'Ungroup'" severity="secondary" text :disabled="!selectedIds.length" @click="ungroupSelected" />
        <Button icon="pi pi-trash" v-tooltip.top="'Delete'" severity="danger" text :disabled="!selectedIds.length" @click="deleteSelected" />
      </div>

      <Tag v-if="formatPainter" value="Format Painter" severity="info" style="margin-bottom:10px" />
      <div v-if="primary" class="property-grid">
        <div v-if="primary.type === 'TEXT'" class="property-row"><label>Text</label><InputText v-model="primary.text" /></div>
        <div v-if="primary.type === 'FIELD'" class="property-row"><label>Field</label><InputText :modelValue="fieldLabel(primary.fieldKey)" disabled /></div>

        <template v-if="primary.type === 'FIELD'">
          <div class="property-inline">
            <div><label>Label</label><ToggleSwitch v-model="primary.showLabel" /></div>
            <div><label>Value</label><ToggleSwitch v-model="primary.showValue" /></div>
          </div>
          <div v-if="primary.showLabel" class="property-row"><label>Label Text</label><InputText v-model="primary.labelText" /></div>
          <div v-if="primary.showLabel && primary.showValue" class="property-row"><label>Separator</label><InputText v-model="primary.labelSeparator" /></div>
          <div class="property-row"><label>Prefix</label><InputText v-model="primary.prefix" /></div>
          <div class="property-row"><label>Suffix</label><InputText v-model="primary.suffix" /></div>
          <div class="property-row"><label>Decimal Places</label><InputNumber v-model="primary.decimalPlaces" :min="0" :max="6" /></div>
        </template>

        <div class="property-two">
          <div class="property-row"><label>X</label><InputNumber v-model="primary.xMm" suffix=" mm" :min="0" :max="pageWidthMm" :maxFractionDigits="2" /></div>
          <div class="property-row"><label>Y</label><InputNumber v-model="primary.yMm" suffix=" mm" :min="0" :max="pageHeightMm" :maxFractionDigits="2" /></div>
        </div>
        <div class="property-two">
          <div class="property-row"><label>Width</label><InputNumber v-model="primary.widthMm" suffix=" mm" :min="1" :max="pageWidthMm" :maxFractionDigits="2" /></div>
          <div v-if="primary.type !== 'LINE'" class="property-row"><label>Height</label><InputNumber v-model="primary.heightMm" suffix=" mm" :min="1" :max="pageHeightMm" :maxFractionDigits="2" /></div>
        </div>

        <template v-if="['TEXT','FIELD'].includes(primary.type)">
          <div class="property-row">
            <label>Font</label>
            <Select v-model="primary.fontFamily" :options="fontOptions" optionLabel="label" optionValue="value" :optionDisabled="fontDisabled" />
          </div>
          <div class="property-two">
            <div class="property-row"><label>Size</label><InputNumber v-model="primary.fontSize" :min="5" :max="60" /></div>
            <div class="property-row"><label>Padding</label><InputNumber v-model="primary.paddingPx" :min="0" :max="30" /></div>
          </div>
          <div class="property-two">
            <div class="property-row"><label>Weight</label><Select v-model="primary.fontWeight" :options="weightOptions" optionLabel="label" optionValue="value" /></div>
            <div class="property-row"><label>Align</label><Select v-model="primary.align" :options="alignOptions" optionLabel="label" optionValue="value" /></div>
          </div>
        </template>

        <div v-if="['LINE','RECTANGLE'].includes(primary.type)" class="property-row"><label>Border</label><InputNumber v-model="primary.borderWidth" :min="0.5" :max="5" :minFractionDigits="1" :maxFractionDigits="1" /></div>
        <div v-if="primary.groupId" class="property-row"><label>Group</label><InputText :modelValue="primary.groupId" disabled /></div>
      </div>
      <div v-else class="empty-state designer-empty"><i class="pi pi-sliders-h" /><strong>Select Element</strong></div>
    </aside>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { api } from '../api/client.js'

const PX_PER_MM = 96 / 25.4
const toast = useToast()
const confirm = useConfirm()
const canvas = ref(null)
const fields = ref([])
const fonts = ref([])
const saving = ref(false)
const selectedIds = ref([])
const formatPainter = ref(null)
const design = ref({ _id: '', name: 'Payslip Design', pageOrientation: 'landscape', active: true, elements: [] })

const orientationOptions = [
  { label: 'Landscape', value: 'landscape' },
  { label: 'Portrait', value: 'portrait' }
]
const weightOptions = [{ label: 'Regular', value: 'normal' }, { label: 'Bold', value: 'bold' }]
const alignOptions = [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }]

const pageWidthMm = computed(() => design.value.pageOrientation === 'portrait' ? 210 : 297)
const pageHeightMm = computed(() => design.value.pageOrientation === 'portrait' ? 297 : 210)
const canvasStyle = computed(() => ({
  width: `${pageWidthMm.value * PX_PER_MM}px`,
  height: `${pageHeightMm.value * PX_PER_MM}px`
}))

const groupedFields = computed(() => {
  const map = new Map()
  for (const field of fields.value) {
    if (!map.has(field.group)) map.set(field.group, [])
    map.get(field.group).push(field)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})
const primary = computed(() => design.value.elements.find((e) => e.uiId === selectedIds.value[0]) || null)
const fieldMap = computed(() => new Map(fields.value.map((field) => [field.key, field])))
const fieldLabel = (key) => fieldMap.value.get(key)?.label || key
const uid = () => crypto.randomUUID()
const fontOptions = computed(() => fonts.value.map((item) => ({ ...item, label: item.available ? item.label : `${item.label} · unavailable` })))
const fontDisabled = (option) => option.available === false

function normalizeElement(element) {
  const field = fieldMap.value.get(element.fieldKey)
  return {
    ...element,
    uiId: element.uiId || element._id || uid(),
    xMm: Number(element.xMm ?? 10),
    yMm: Number(element.yMm ?? 10),
    widthMm: Number(element.widthMm ?? 40),
    heightMm: Number(element.heightMm ?? 7),
    fontFamily: element.fontFamily || 'Times New Roman',
    fontSize: Number(element.fontSize ?? 10),
    fontWeight: element.fontWeight || 'normal',
    align: element.align || 'left',
    paddingPx: Number(element.paddingPx ?? 3),
    borderWidth: Number(element.borderWidth ?? 1),
    decimalPlaces: Number(element.decimalPlaces ?? 2),
    groupId: element.groupId || '',
    showLabel: element.showLabel === true,
    showValue: element.showValue !== false,
    labelText: element.labelText || field?.label || '',
    labelSeparator: element.labelSeparator ?? ': ',
    prefix: element.prefix || '',
    suffix: element.suffix || '',
    zIndex: Number(element.zIndex ?? 0)
  }
}

function normalizeDesign(raw) {
  return {
    ...raw,
    _id: raw?._id || '',
    name: raw?.name || 'Payslip Design',
    pageOrientation: raw?.pageOrientation || 'landscape',
    active: raw?.active !== false,
    elements: (raw?.elements || []).map(normalizeElement)
  }
}

function previewFieldText(element) {
  const field = fieldMap.value.get(element.fieldKey)
  const value = `${element.prefix || ''}${field?.sampleValue ?? ''}${element.suffix || ''}`
  const label = element.labelText || field?.label || element.fieldKey
  if (element.showLabel && element.showValue) return `${label}${element.labelSeparator ?? ': '}${value}`
  if (element.showLabel) return label
  if (element.showValue !== false) return value
  return ''
}

function elementStyle(element) {
  const base = {
    left: `${element.xMm * PX_PER_MM}px`,
    top: `${element.yMm * PX_PER_MM}px`,
    width: `${element.widthMm * PX_PER_MM}px`,
    height: `${Math.max(element.heightMm || 1, 1) * PX_PER_MM}px`,
    fontFamily: `'${element.fontFamily || 'Times New Roman'}'`,
    fontSize: `${element.fontSize || 10}px`,
    fontWeight: element.fontWeight || 'normal',
    textAlign: element.align || 'left',
    padding: `${element.paddingPx ?? 3}px`,
    zIndex: element.zIndex || 0
  }
  if (element.type === 'LINE') {
    base.height = '1px'
    base.padding = '0'
    base.borderTopWidth = `${element.borderWidth || 1}px`
    base.borderTopColor = '#111827'
  }
  if (element.type === 'RECTANGLE') {
    base.padding = '0'
    base.borderStyle = 'solid'
    base.borderColor = '#111827'
    base.borderWidth = `${element.borderWidth || 1}px`
  }
  return base
}

function dragField(event, field) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-payroll-field', JSON.stringify({ key: field.key }))
}

function dropField(event) {
  const payload = event.dataTransfer.getData('application/x-payroll-field')
  if (!payload) return
  const { key } = JSON.parse(payload)
  const field = fieldMap.value.get(key)
  const rect = canvas.value.getBoundingClientRect()
  const element = normalizeElement({
    type: 'FIELD', fieldKey: key,
    xMm: Math.max(0, (event.clientX - rect.left) / PX_PER_MM),
    yMm: Math.max(0, (event.clientY - rect.top) / PX_PER_MM),
    widthMm: 55, heightMm: 7,
    fontFamily: 'Times New Roman', fontSize: 10, paddingPx: 3,
    showLabel: false, showValue: true, labelText: field?.label || key,
    decimalPlaces: 2
  })
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}

function addText() {
  const e = normalizeElement({ type: 'TEXT', text: 'Text', xMm: 20, yMm: 20, widthMm: 55, heightMm: 8, fontFamily: 'Times New Roman', fontSize: 10, paddingPx: 3 })
  design.value.elements.push(e)
  selectedIds.value = [e.uiId]
}
function addLine() { const e = normalizeElement({ type: 'LINE', xMm: 20, yMm: 30, widthMm: 80, heightMm: 1, borderWidth: 1, paddingPx: 0 }); design.value.elements.push(e); selectedIds.value = [e.uiId] }
function addRectangle() { const e = normalizeElement({ type: 'RECTANGLE', xMm: 20, yMm: 40, widthMm: 80, heightMm: 25, borderWidth: 1, paddingPx: 0 }); design.value.elements.push(e); selectedIds.value = [e.uiId] }

function applyFormat(target) {
  Object.assign(target, JSON.parse(JSON.stringify(formatPainter.value)))
  formatPainter.value = null
}
function selectElement(event, element) {
  if (formatPainter.value) { applyFormat(element); selectedIds.value = [element.uiId]; return }
  if (event.ctrlKey || event.metaKey) {
    selectedIds.value = selectedIds.value.includes(element.uiId)
      ? selectedIds.value.filter((id) => id !== element.uiId)
      : [...selectedIds.value, element.uiId]
    return
  }
  if (element.groupId) {
    selectedIds.value = design.value.elements.filter((e) => e.groupId === element.groupId).map((e) => e.uiId)
  } else selectedIds.value = [element.uiId]
}
function clearSelection() { selectedIds.value = [] }

function startMove(event, element) {
  if (event.button !== 0) return
  if (!selectedIds.value.includes(element.uiId)) selectElement(event, element)
  const ids = selectedIds.value.includes(element.uiId) ? [...selectedIds.value] : [element.uiId]
  const startX = event.clientX, startY = event.clientY
  const positions = new Map(ids.map((id) => {
    const item = design.value.elements.find((e) => e.uiId === id)
    return [id, { xMm: item.xMm, yMm: item.yMm }]
  }))
  const move = (e) => {
    const dx = (e.clientX - startX) / PX_PER_MM
    const dy = (e.clientY - startY) / PX_PER_MM
    for (const id of ids) {
      const item = design.value.elements.find((x) => x.uiId === id)
      const start = positions.get(id)
      item.xMm = Math.max(0, Math.min(pageWidthMm.value - item.widthMm, start.xMm + dx))
      item.yMm = Math.max(0, Math.min(pageHeightMm.value - item.heightMm, start.yMm + dy))
    }
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function deleteSelected() { design.value.elements = design.value.elements.filter((e) => !selectedIds.value.includes(e.uiId)); selectedIds.value = [] }
function duplicateSelected() {
  const copies = design.value.elements.filter((e) => selectedIds.value.includes(e.uiId)).map((e) => normalizeElement({ ...JSON.parse(JSON.stringify(e)), _id: undefined, uiId: uid(), xMm: e.xMm + 3, yMm: e.yMm + 3, groupId: '' }))
  design.value.elements.push(...copies); selectedIds.value = copies.map((e) => e.uiId)
}
function groupSelected() { const groupId = uid(); for (const e of design.value.elements) { if (selectedIds.value.includes(e.uiId)) e.groupId = groupId } }
function ungroupSelected() { for (const e of design.value.elements) { if (selectedIds.value.includes(e.uiId)) e.groupId = '' } }
function copyFormat() {
  if (!primary.value) return
  const keys = ['fontFamily', 'fontSize', 'fontWeight', 'align', 'paddingPx', 'widthMm', 'heightMm', 'borderWidth', 'decimalPlaces', 'showLabel', 'showValue', 'labelText', 'labelSeparator', 'prefix', 'suffix']
  formatPainter.value = Object.fromEntries(keys.map((key) => [key, primary.value[key]]))
}

async function loadDefaultDesign() {
  const { data } = await api.get('/payslips/default-design')
  design.value = normalizeDesign({ ...data.item, _id: design.value._id || '', active: true })
  selectedIds.value = []
  toast.add({ severity: 'success', summary: 'Default payslip loaded', life: 1800 })
}
function confirmDefault() {
  confirm.require({
    message: 'Load the default TRAX payslip layout?',
    header: 'Default Payslip',
    icon: 'pi pi-file',
    acceptLabel: 'Load',
    rejectLabel: 'Cancel',
    accept: loadDefaultDesign
  })
}

async function load() {
  const [{ data: fieldData }, { data: designData }, { data: fontData }] = await Promise.all([
    api.get('/payslips/fields'),
    api.get('/payslips/designs/active'),
    api.get('/payslips/fonts')
  ])
  fields.value = fieldData.items
  fonts.value = fontData.items
  if (designData.item) design.value = normalizeDesign(designData.item)
}

async function saveDesign() {
  saving.value = true
  try {
    const payload = {
      name: design.value.name || 'Payslip Design',
      pageOrientation: design.value.pageOrientation || 'landscape',
      active: true,
      elements: design.value.elements.map(({ uiId, ...element }) => element)
    }
    const { data } = design.value._id
      ? await api.put(`/payslips/designs/${design.value._id}`, payload)
      : await api.post('/payslips/designs', payload)
    design.value = normalizeDesign(data)
    selectedIds.value = []
    toast.add({ severity: 'success', summary: 'Payslip design saved', life: 2200 })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot save design', detail: error.response?.data?.message || error.message, life: 5000 })
  } finally { saving.value = false }
}

onMounted(load)
</script>
