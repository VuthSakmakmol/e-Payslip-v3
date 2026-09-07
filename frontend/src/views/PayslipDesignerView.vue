<template>
  <div class="designer-page">
    <div class="surface-panel designer-toolbar-v2">
      <div class="designer-toolbar-main">
        <Button icon="pi pi-arrow-left" text rounded severity="secondary" v-tooltip.bottom="'Payslip Designs'" @click="goBack" />
        <InputText v-model="design.name" class="designer-name-input" placeholder="Design name" />
        <Select
          v-model="design.pageOrientation"
          :options="orientationOptions"
          optionLabel="label"
          optionValue="value"
          class="designer-orientation"
        />
        <Tag value="A4" severity="secondary" />
      </div>

      <div class="designer-toolbar-tools">
        <div class="designer-selection-tools">
          <Button
            label="Format"
            icon="pi pi-palette"
            size="small"
            :severity="formatPainter ? 'info' : 'secondary'"
            :outlined="!formatPainter"
            :disabled="!primary"
            @click="copyFormat"
          />
          <Button label="Group" icon="pi pi-link" size="small" severity="secondary" outlined :disabled="selectedIds.length < 2" @click="groupSelected" />
          <Button label="Ungroup" icon="pi pi-times" size="small" severity="secondary" outlined :disabled="!canUngroup" @click="ungroupSelected" />
        </div>

        <div class="designer-zoom-control" role="group" aria-label="Canvas zoom">
          <Button icon="pi pi-minus" severity="secondary" text rounded @click="zoomOut" />
          <Select
            v-model="zoomPercent"
            :options="zoomOptions"
            optionLabel="label"
            optionValue="value"
            class="designer-zoom-select"
            @change="zoomMode = 'manual'"
          />
          <Button icon="pi pi-plus" severity="secondary" text rounded @click="zoomIn" />
          <Button label="Fit" icon="pi pi-expand" severity="secondary" text @click="fitCanvas" />
        </div>

        <Button label="Save" icon="pi pi-save" :loading="saving" @click="saveDesign" />
      </div>
    </div>

    <div v-if="formatPainter" class="designer-format-banner">
      <i class="pi pi-palette" />
      <span>Format</span>
      <Button icon="pi pi-times" text rounded size="small" @click="formatPainter = null" />
    </div>

    <div class="designer-shell-v2">
      <aside class="designer-panel designer-fields-panel">
        <div class="designer-panel-head">
          <strong>Fields</strong>
          <div class="designer-panel-actions">
            <Button icon="pi pi-plus" text rounded size="small" v-tooltip.top="'Text'" @click="addText" />
            <Button icon="pi pi-minus" text rounded size="small" v-tooltip.top="'Line'" @click="addLine" />
            <Button icon="pi pi-stop" text rounded size="small" v-tooltip.top="'Box'" @click="addRectangle" />
          </div>
        </div>
        <div class="designer-field-search">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="fieldSearch" placeholder="Search field" />
          </IconField>
        </div>
        <div class="designer-panel-scroll designer-field-list">
          <div v-for="group in groupedFields" :key="group.name" class="field-group">
            <div class="field-group-title">{{ group.name }}</div>
            <div
              v-for="field in group.items"
              :key="field.key"
              class="field-chip"
              draggable="true"
              @dragstart="dragField($event, field)"
              @dblclick="addField(field)"
            >
              <i class="pi pi-database" />
              <span>{{ field.label }}</span>
            </div>
          </div>
        </div>
      </aside>

      <section ref="canvasWrap" class="canvas-wrap-v2" @wheel.ctrl.prevent="handleZoomWheel">
        <div class="canvas-center">
          <div
            ref="canvas"
            class="payslip-canvas-v2"
            :style="canvasStyle"
            @dragover.prevent
            @drop="dropField"
            @click.self="clearSelection"
          >
            <div
              v-for="element in design.elements"
              :key="element.uiId"
              class="design-element-v2"
              :class="[
                { selected: selectedIds.includes(element.uiId) },
                { grouped: element.groupId && selectedIds.includes(element.uiId) },
                `is-${element.type.toLowerCase()}`
              ]"
              :style="elementStyle(element)"
              @pointerdown="startMove($event, element)"
              @click.stop="selectElement($event, element)"
            >
              <template v-if="element.type === 'FIELD'">{{ previewFieldText(element) }}</template>
              <template v-else-if="element.type === 'TEXT'">{{ element.text }}</template>
            </div>
          </div>
        </div>
      </section>

      <aside class="designer-panel designer-properties-panel">
        <div class="designer-panel-head">
          <strong>Properties</strong>
          <div class="designer-panel-actions">
            <Button icon="pi pi-copy" text rounded size="small" :disabled="!selectedIds.length" v-tooltip.top="'Duplicate'" @click="duplicateSelected" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" :disabled="!selectedIds.length" v-tooltip.top="'Delete'" @click="deleteSelected" />
          </div>
        </div>

        <div v-if="primary" class="designer-panel-scroll inspector-body">
          <div v-if="selectedIds.length > 1" class="inspector-selection-count">
            <Tag :value="`${selectedIds.length} selected`" severity="info" />
          </div>

          <section v-if="primary.type === 'FIELD'" class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-database" /> Data</div>
            <div class="property-row">
              <label>Field</label>
              <InputText :modelValue="fieldLabel(primary.fieldKey)" disabled />
            </div>
            <div class="property-inline compact-toggle-grid">
              <div><label>Label</label><ToggleSwitch v-model="primary.showLabel" /></div>
              <div><label>Value</label><ToggleSwitch v-model="primary.showValue" /></div>
            </div>
            <div v-if="primary.showLabel" class="property-row">
              <label>Label Text</label>
              <InputText v-model="primary.labelText" />
            </div>
          </section>

          <section v-if="primary.type === 'TEXT'" class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-align-left" /> Text</div>
            <div class="property-row">
              <label>Text</label>
              <InputText v-model="primary.text" />
            </div>
          </section>

          <section v-if="['TEXT','FIELD'].includes(primary.type)" class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-palette" /> Format</div>
            <div class="property-row">
              <label>Font</label>
              <Select v-model="primary.fontFamily" :options="fontOptions" optionLabel="label" optionValue="value" :optionDisabled="fontDisabled" />
            </div>
            <div class="property-two">
              <div class="property-row">
                <label>Size</label>
                <InputNumber v-model="primary.fontSize" :min="5" :max="60" />
              </div>
              <div class="property-row">
                <label>Padding</label>
                <InputNumber v-model="primary.paddingPx" :min="0" :max="30" />
              </div>
            </div>
            <div class="property-two">
              <div class="property-row">
                <label>Weight</label>
                <Select v-model="primary.fontWeight" :options="weightOptions" optionLabel="label" optionValue="value" />
              </div>
              <div class="property-row">
                <label>Align</label>
                <Select v-model="primary.align" :options="alignOptions" optionLabel="label" optionValue="value" />
              </div>
            </div>
            <div class="property-two">
              <div class="property-row">
                <label>Text</label>
                <div class="color-control">
                  <input v-model="primary.textColor" type="color" />
                  <InputText v-model="primary.textColor" />
                </div>
              </div>
              <div class="property-row">
                <label>Fill</label>
                <div class="color-control">
                  <input :value="displayBackgroundColor(primary.backgroundColor)" type="color" @input="primary.backgroundColor = $event.target.value" />
                  <Button
                    :label="isTransparent(primary.backgroundColor) ? 'None' : primary.backgroundColor"
                    severity="secondary"
                    outlined
                    size="small"
                    @click="toggleBackground(primary)"
                  />
                </div>
              </div>
            </div>
            <div class="property-two">
              <div class="property-row">
                <label>Border</label>
                <InputNumber v-model="primary.borderWidth" :min="0" :max="8" :minFractionDigits="0" :maxFractionDigits="1" />
              </div>
              <div class="property-row">
                <label>Border Color</label>
                <div class="color-control">
                  <input v-model="primary.borderColor" type="color" />
                  <InputText v-model="primary.borderColor" />
                </div>
              </div>
            </div>
          </section>

          <section v-if="['LINE','RECTANGLE'].includes(primary.type)" class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-palette" /> Format</div>
            <div class="property-two">
              <div class="property-row">
                <label>Border</label>
                <InputNumber v-model="primary.borderWidth" :min="0.5" :max="8" :minFractionDigits="1" :maxFractionDigits="1" />
              </div>
              <div class="property-row">
                <label>Color</label>
                <div class="color-control">
                  <input v-model="primary.borderColor" type="color" />
                  <InputText v-model="primary.borderColor" />
                </div>
              </div>
            </div>
            <div v-if="primary.type === 'RECTANGLE'" class="property-row">
              <label>Fill</label>
              <div class="color-control">
                <input :value="displayBackgroundColor(primary.backgroundColor)" type="color" @input="primary.backgroundColor = $event.target.value" />
                <Button
                  :label="isTransparent(primary.backgroundColor) ? 'None' : primary.backgroundColor"
                  severity="secondary"
                  outlined
                  size="small"
                  @click="toggleBackground(primary)"
                />
              </div>
            </div>
          </section>

          <section class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-arrows-alt" /> Position</div>
            <div class="property-two">
              <div class="property-row"><label>X</label><InputNumber v-model="primary.xMm" suffix=" mm" :min="0" :max="pageWidthMm" :maxFractionDigits="2" /></div>
              <div class="property-row"><label>Y</label><InputNumber v-model="primary.yMm" suffix=" mm" :min="0" :max="pageHeightMm" :maxFractionDigits="2" /></div>
            </div>
            <div class="property-two">
              <div class="property-row"><label>Width</label><InputNumber v-model="primary.widthMm" suffix=" mm" :min="1" :max="pageWidthMm" :maxFractionDigits="2" /></div>
              <div v-if="primary.type !== 'LINE'" class="property-row"><label>Height</label><InputNumber v-model="primary.heightMm" suffix=" mm" :min="1" :max="pageHeightMm" :maxFractionDigits="2" /></div>
            </div>
          </section>

          <section v-if="primary.groupId" class="inspector-section">
            <div class="inspector-section-title"><i class="pi pi-link" /> Group</div>
            <div class="group-chip-row">
              <Tag value="Grouped" severity="secondary" />
              <Button label="Ungroup" icon="pi pi-times" size="small" severity="secondary" text @click="ungroupSelected" />
            </div>
          </section>
        </div>

        <div v-else class="designer-inspector-empty">
          <i class="pi pi-sliders-h" />
          <strong>Select an element</strong>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { api } from '../api/client.js'

const BASE_PX_PER_MM = 96 / 25.4
const route = useRoute()
const router = useRouter()
const toast = useToast()
const canvas = ref(null)
const canvasWrap = ref(null)
const fields = ref([])
const fonts = ref([])
const saving = ref(false)
const selectedIds = ref([])
const formatPainter = ref(null)
const fieldSearch = ref('')
const zoomPercent = ref(100)
const zoomMode = ref('fit')
let resizeObserver = null

const design = ref({
  _id: '',
  name: 'New Payslip',
  pageOrientation: 'landscape',
  active: false,
  elements: []
})

const orientationOptions = [
  { label: 'Landscape', value: 'landscape' },
  { label: 'Portrait', value: 'portrait' }
]
const weightOptions = [
  { label: 'Regular', value: 'normal' },
  { label: 'Bold', value: 'bold' }
]
const alignOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' }
]
const zoomOptions = [25, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]
  .map((value) => ({ label: `${value}%`, value }))

const pageWidthMm = computed(() => design.value.pageOrientation === 'portrait' ? 210 : 297)
const pageHeightMm = computed(() => design.value.pageOrientation === 'portrait' ? 297 : 210)
const zoomScale = computed(() => Math.max(0.25, Math.min(2, Number(zoomPercent.value || 100) / 100)))
const pxPerMm = computed(() => BASE_PX_PER_MM * zoomScale.value)
const canvasStyle = computed(() => ({
  width: `${pageWidthMm.value * pxPerMm.value}px`,
  height: `${pageHeightMm.value * pxPerMm.value}px`
}))
const fieldMap = computed(() => new Map(fields.value.map((item) => [item.key, item])))
const groupedFields = computed(() => {
  const q = fieldSearch.value.trim().toLowerCase()
  const source = q
    ? fields.value.filter((item) => `${item.label} ${item.key}`.toLowerCase().includes(q))
    : fields.value
  const groups = new Map()
  for (const item of source) {
    const name = item.group || 'OTHER'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})
const primary = computed(() => design.value.elements.find((element) => element.uiId === selectedIds.value[0]) || null)
const canUngroup = computed(() => selectedIds.value.some((id) => design.value.elements.find((item) => item.uiId === id)?.groupId))
const fontOptions = computed(() => fonts.value.map((font) => ({
  label: font.available ? font.label : `${font.label} · unavailable`,
  value: font.value,
  available: font.available
})))

function fontDisabled(option) {
  return option.available === false
}

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanColor(value, fallback = '#111827') {
  const text = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback
}

function normalizeElement(raw = {}) {
  const field = fieldMap.value.get(raw.fieldKey)
  return {
    ...raw,
    uiId: raw.uiId || uid(),
    type: raw.type || 'TEXT',
    fieldKey: raw.fieldKey || '',
    text: raw.text || '',
    xMm: Number(raw.xMm ?? 20),
    yMm: Number(raw.yMm ?? 20),
    widthMm: Number(raw.widthMm ?? 55),
    heightMm: Number(raw.heightMm ?? (raw.type === 'LINE' ? 1 : 7)),
    fontFamily: raw.fontFamily || 'Times New Roman',
    fontSize: Number(raw.fontSize ?? 10),
    fontWeight: raw.fontWeight || 'normal',
    align: raw.align || 'left',
    paddingPx: Number(raw.paddingPx ?? 3),
    textColor: cleanColor(raw.textColor, '#111827'),
    backgroundColor: raw.backgroundColor && raw.backgroundColor !== 'transparent'
      ? cleanColor(raw.backgroundColor, '#ffffff')
      : 'transparent',
    borderColor: cleanColor(raw.borderColor, '#111827'),
    borderWidth: Number(raw.borderWidth ?? (['LINE', 'RECTANGLE'].includes(raw.type) ? 1 : 0)),
    groupId: raw.groupId || '',
    showLabel: raw.showLabel === true,
    showValue: raw.showValue !== false,
    labelText: raw.labelText || field?.label || '',
    zIndex: Number(raw.zIndex ?? 0)
  }
}

function normalizeDesign(raw = {}) {
  return {
    ...raw,
    _id: raw._id || '',
    name: raw.name || 'New Payslip',
    pageOrientation: raw.pageOrientation || 'landscape',
    active: raw.active === true,
    elements: (raw.elements || []).map(normalizeElement)
  }
}

function fieldLabel(key) {
  return fieldMap.value.get(key)?.label || key || 'Field'
}

function previewFieldText(element) {
  const field = fieldMap.value.get(element.fieldKey)
  const value = String(field?.sampleValue ?? '')
  const label = element.labelText || field?.label || element.fieldKey
  if (element.showLabel && element.showValue) return `${label}: ${value}`
  if (element.showLabel) return label
  if (element.showValue !== false) return value
  return ''
}

function elementStyle(element) {
  const scale = zoomScale.value
  const base = {
    left: `${element.xMm * pxPerMm.value}px`,
    top: `${element.yMm * pxPerMm.value}px`,
    width: `${element.widthMm * pxPerMm.value}px`,
    height: `${Math.max(element.heightMm || 1, 1) * pxPerMm.value}px`,
    fontFamily: `'${element.fontFamily || 'Times New Roman'}'`,
    fontSize: `${(element.fontSize || 10) * scale}px`,
    fontWeight: element.fontWeight || 'normal',
    textAlign: element.align || 'left',
    padding: `${(element.paddingPx ?? 3) * scale}px`,
    color: cleanColor(element.textColor, '#111827'),
    background: isTransparent(element.backgroundColor) ? 'transparent' : cleanColor(element.backgroundColor, '#ffffff'),
    borderColor: cleanColor(element.borderColor, '#111827'),
    zIndex: element.zIndex || 0
  }

  if (element.type === 'LINE') {
    base.height = `${Math.max((element.borderWidth || 1) * scale, 1)}px`
    base.padding = '0'
    base.background = cleanColor(element.borderColor, '#111827')
    base.border = '0'
  } else if (element.type === 'RECTANGLE') {
    base.padding = '0'
    base.borderStyle = 'solid'
    base.borderWidth = `${Math.max((element.borderWidth || 1) * scale, 1)}px`
  } else {
    const width = Number(element.borderWidth || 0)
    base.borderStyle = width > 0 ? 'solid' : 'none'
    base.borderWidth = width > 0 ? `${Math.max(width * scale, 1)}px` : '0'
  }

  return base
}

function clampZoom(value) {
  return Math.max(25, Math.min(200, Math.round(value)))
}
function setZoom(value) {
  zoomMode.value = 'manual'
  zoomPercent.value = clampZoom(value)
}
function zoomIn() {
  const options = zoomOptions.map((item) => item.value)
  const next = options.find((value) => value > zoomPercent.value)
  setZoom(next || 200)
}
function zoomOut() {
  const options = zoomOptions.map((item) => item.value).reverse()
  const next = options.find((value) => value < zoomPercent.value)
  setZoom(next || 25)
}
function handleZoomWheel(event) {
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
}
function fitCanvas() {
  if (!canvasWrap.value) return
  zoomMode.value = 'fit'
  const width = Math.max(canvasWrap.value.clientWidth - 56, 180)
  const height = Math.max(canvasWrap.value.clientHeight - 56, 180)
  const widthScale = width / (pageWidthMm.value * BASE_PX_PER_MM)
  const heightScale = height / (pageHeightMm.value * BASE_PX_PER_MM)
  zoomPercent.value = clampZoom(Math.min(widthScale, heightScale, 1) * 100)
}

function dragField(event, field) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-payroll-field', JSON.stringify({ key: field.key }))
}

function makeField(field, xMm = 20, yMm = 20) {
  return normalizeElement({
    type: 'FIELD',
    fieldKey: field.key,
    xMm,
    yMm,
    widthMm: 55,
    heightMm: 7,
    fontFamily: 'Times New Roman',
    fontSize: 10,
    paddingPx: 3,
    showLabel: false,
    showValue: true,
    labelText: field.label
  })
}

function addField(field) {
  const element = makeField(field, 20, 20)
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}

function dropField(event) {
  const payload = event.dataTransfer.getData('application/x-payroll-field')
  if (!payload) return
  const { key } = JSON.parse(payload)
  const field = fieldMap.value.get(key)
  if (!field) return
  const rect = canvas.value.getBoundingClientRect()
  const element = makeField(
    field,
    Math.max(0, (event.clientX - rect.left) / pxPerMm.value),
    Math.max(0, (event.clientY - rect.top) / pxPerMm.value)
  )
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}

function addText() {
  const element = normalizeElement({
    type: 'TEXT', text: 'Text', xMm: 20, yMm: 20,
    widthMm: 55, heightMm: 8, fontFamily: 'Times New Roman', fontSize: 10, paddingPx: 3
  })
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}
function addLine() {
  const element = normalizeElement({ type: 'LINE', xMm: 20, yMm: 30, widthMm: 80, heightMm: 1, borderWidth: 1, paddingPx: 0 })
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}
function addRectangle() {
  const element = normalizeElement({ type: 'RECTANGLE', xMm: 20, yMm: 40, widthMm: 80, heightMm: 25, borderWidth: 1, paddingPx: 0 })
  design.value.elements.push(element)
  selectedIds.value = [element.uiId]
}

function applyFormat(target) {
  Object.assign(target, JSON.parse(JSON.stringify(formatPainter.value)))
  formatPainter.value = null
}

function selectElement(event, element) {
  if (formatPainter.value) {
    applyFormat(element)
    selectedIds.value = [element.uiId]
    return
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    selectedIds.value = selectedIds.value.includes(element.uiId)
      ? selectedIds.value.filter((id) => id !== element.uiId)
      : [...selectedIds.value, element.uiId]
    return
  }

  if (element.groupId) {
    selectedIds.value = design.value.elements
      .filter((item) => item.groupId === element.groupId)
      .map((item) => item.uiId)
  } else {
    selectedIds.value = [element.uiId]
  }
}

function clearSelection() {
  selectedIds.value = []
}

function startMove(event, element) {
  if (event.button !== 0 || formatPainter.value) return
  if (!selectedIds.value.includes(element.uiId)) selectElement(event, element)
  const ids = selectedIds.value.includes(element.uiId) ? [...selectedIds.value] : [element.uiId]
  const startX = event.clientX
  const startY = event.clientY
  const positions = new Map(ids.map((id) => {
    const item = design.value.elements.find((candidate) => candidate.uiId === id)
    return [id, { xMm: item.xMm, yMm: item.yMm }]
  }))

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / pxPerMm.value
    const dy = (moveEvent.clientY - startY) / pxPerMm.value
    for (const id of ids) {
      const item = design.value.elements.find((candidate) => candidate.uiId === id)
      const start = positions.get(id)
      item.xMm = Math.max(0, Math.min(pageWidthMm.value - item.widthMm, start.xMm + dx))
      item.yMm = Math.max(0, Math.min(pageHeightMm.value - item.heightMm, start.yMm + dy))
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function deleteSelected() {
  design.value.elements = design.value.elements.filter((element) => !selectedIds.value.includes(element.uiId))
  selectedIds.value = []
}

function duplicateSelected() {
  const copies = design.value.elements
    .filter((element) => selectedIds.value.includes(element.uiId))
    .map((element) => normalizeElement({
      ...JSON.parse(JSON.stringify(element)),
      _id: undefined,
      uiId: uid(),
      xMm: element.xMm + 3,
      yMm: element.yMm + 3,
      groupId: ''
    }))
  design.value.elements.push(...copies)
  selectedIds.value = copies.map((element) => element.uiId)
}

function groupSelected() {
  if (selectedIds.value.length < 2) return
  const groupId = uid()
  for (const element of design.value.elements) {
    if (selectedIds.value.includes(element.uiId)) element.groupId = groupId
  }
}

function ungroupSelected() {
  for (const element of design.value.elements) {
    if (selectedIds.value.includes(element.uiId)) element.groupId = ''
  }
}

function copyFormat() {
  if (!primary.value) return
  const keys = [
    'fontFamily', 'fontSize', 'fontWeight', 'align', 'paddingPx',
    'textColor', 'backgroundColor', 'borderColor', 'borderWidth'
  ]
  formatPainter.value = Object.fromEntries(keys.map((key) => [key, primary.value[key]]))
}

function isTransparent(value) {
  return !value || value === 'transparent'
}
function displayBackgroundColor(value) {
  return isTransparent(value) ? '#ffffff' : cleanColor(value, '#ffffff')
}
function toggleBackground(element) {
  element.backgroundColor = isTransparent(element.backgroundColor) ? '#ffffff' : 'transparent'
}

async function load() {
  const [{ data: fieldData }, { data: fontData }] = await Promise.all([
    api.get('/payslips/fields'),
    api.get('/payslips/fonts')
  ])
  fields.value = fieldData.items || []
  fonts.value = fontData.items || []

  if (route.params.id) {
    const { data } = await api.get(`/payslips/designs/${route.params.id}`)
    design.value = normalizeDesign(data.item)
    return
  }

  if (route.query.template === 'default') {
    const { data } = await api.get('/payslips/default-design')
    design.value = normalizeDesign({ ...data.item, _id: '', active: false })
  } else {
    design.value = normalizeDesign({
      name: 'New Payslip',
      pageOrientation: 'landscape',
      active: false,
      elements: []
    })
  }
}

async function saveDesign() {
  saving.value = true
  try {
    const payload = {
      name: design.value.name || 'Payslip Design',
      pageOrientation: design.value.pageOrientation || 'landscape',
      elements: design.value.elements.map(({ uiId, ...element }) => element)
    }
    const { data } = design.value._id
      ? await api.put(`/payslips/designs/${design.value._id}`, payload)
      : await api.post('/payslips/designs', payload)

    design.value = normalizeDesign(data)
    selectedIds.value = []
    if (!route.params.id) {
      await router.replace({ name: 'payslip-design-edit', params: { id: data._id } })
    }
    toast.add({ severity: 'success', summary: 'Design saved', life: 1800 })
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Cannot save design', detail: error.response?.data?.message || error.message, life: 4500 })
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'payslip-designs' })
}

function handleKeydown(event) {
  if (event.key === 'Escape' && formatPainter.value) {
    formatPainter.value = null
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.value.length) {
    const tag = String(event.target?.tagName || '').toLowerCase()
    if (!['input', 'textarea'].includes(tag)) deleteSelected()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedIds.value.length) {
    event.preventDefault()
    duplicateSelected()
  }
}

watch(() => design.value.pageOrientation, () => {
  if (zoomMode.value === 'fit') nextTick(fitCanvas)
})

onMounted(async () => {
  await load()
  await nextTick()
  fitCanvas()
  window.addEventListener('keydown', handleKeydown)
  if (typeof ResizeObserver !== 'undefined' && canvasWrap.value) {
    resizeObserver = new ResizeObserver(() => {
      if (zoomMode.value === 'fit') fitCanvas()
    })
    resizeObserver.observe(canvasWrap.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeydown)
})
</script>
