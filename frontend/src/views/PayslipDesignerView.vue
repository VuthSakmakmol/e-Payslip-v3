<template>
  <div class="pdfme-page">
    <div class="surface-panel pdfme-toolbar">
      <div class="pdfme-toolbar-main">
        <Button icon="pi pi-arrow-left" text rounded severity="secondary" v-tooltip.bottom="'Payslip Designs'" @click="goBack" />
        <InputText v-model="design.name" class="pdfme-design-name" placeholder="Design name" />
        <Select
          v-model="design.pageOrientation"
          :options="orientationOptions"
          optionLabel="label"
          optionValue="value"
          class="pdfme-orientation"
          @change="applyOrientation"
        />
        <Tag value="A4" severity="secondary" />
      </div>

      <div class="pdfme-toolbar-actions">
        <span class="pdfme-element-count">{{ elementCount }} elements</span>
        <Button label="Save" icon="pi pi-save" :loading="saving" :disabled="loading || !designerReady" @click="saveDesign" />
      </div>
    </div>

    <div class="pdfme-workspace">
      <aside class="surface-panel pdfme-payroll-panel">
        <div class="pdfme-panel-head">
          <div>
            <strong>Payroll Fields</strong>
            <span>Click a field to add it</span>
          </div>
          <Tag :value="String(fields.length)" severity="secondary" />
        </div>

        <div class="pdfme-field-search">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="fieldSearch" placeholder="Search payroll field" />
          </IconField>
        </div>

        <div class="pdfme-field-scroll">
          <div v-for="group in groupedFields" :key="group.name" class="pdfme-field-group">
            <div class="pdfme-field-group-title">{{ group.name }}</div>
            <button
              v-for="field in group.items"
              :key="field.key"
              type="button"
              class="pdfme-field-item"
              :title="`Add ${field.label}`"
              @click="addField(field)"
            >
              <div class="pdfme-field-copy">
                <strong>{{ field.label }}</strong>
                <span>{{ field.sampleValue || field.key }}</span>
              </div>
              <i class="pi pi-plus" />
            </button>
          </div>

          <div v-if="!groupedFields.length" class="pdfme-no-fields">
            <i class="pi pi-search" />
            <span>No matching fields</span>
          </div>
        </div>

        <div class="pdfme-panel-help">
          <strong>Built-in tools are inside the designer</strong>
          <span>Text, image/logo, line, rectangle and ellipse already include drag, resize, rotation, alignment, borders, padding and styling.</span>
        </div>
      </aside>

      <section class="surface-panel pdfme-designer-panel">
        <div v-if="loading" class="pdfme-loading">
          <i class="pi pi-spin pi-spinner" />
          <strong>Loading designer</strong>
        </div>
        <div v-else-if="loadError" class="pdfme-loading is-error">
          <i class="pi pi-exclamation-triangle" />
          <strong>Cannot load designer</strong>
          <span>{{ loadError }}</span>
        </div>
        <div v-show="!loading && !loadError" ref="designerHost" class="pdfme-designer-host" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { Designer } from '@pdfme/ui'
import { api } from '../api/client.js'
import {
  addPayrollFieldToTemplate,
  blankPdfmeTemplate,
  chooseKhmerDesignerFont,
  countTemplateElements,
  createPayslipPdfmePlugins,
  normalizeTemplateForOrientation,
  prepareTemplateForDesignerFonts,
  syncTemplateFontMetadata
} from '../payslips/pdfmeDesigner.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const designerHost = ref(null)
const designerReady = ref(false)
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const fields = ref([])
const fieldSearch = ref('')
const elementCount = ref(0)
const khmerFontReady = ref(false)
let designer = null
let designerFonts = {}
let designerFontNames = []
let designerDefaultFontName = ''

const design = reactive({
  _id: '',
  name: 'New Payslip Design',
  pageOrientation: 'landscape',
  active: false,
  templateRevision: 1,
  pdfmeTemplate: blankPdfmeTemplate('landscape')
})

const orientationOptions = [
  { label: 'Landscape', value: 'landscape' },
  { label: 'Portrait', value: 'portrait' }
]

const groupedFields = computed(() => {
  const q = fieldSearch.value.trim().toLowerCase()
  const visible = !q
    ? fields.value
    : fields.value.filter((field) =>
      `${field.label || ''} ${field.key || ''} ${field.group || ''}`.toLowerCase().includes(q)
    )

  const groups = new Map()
  visible.forEach((field) => {
    const name = field.group || 'Other'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(field)
  })
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})

function currentTemplate() {
  const source = designer ? designer.getTemplate() : design.pdfmeTemplate
  return syncTemplateFontMetadata(source, design.pageOrientation)
}

async function loadDesignerFonts(fontCatalog = []) {
  const available = (fontCatalog || []).filter((item) => item?.designerAvailable === true)
  const loaded = {}

  await Promise.all(available.map(async (item) => {
    try {
      const response = await api.get('/payslips/fonts/file', {
        params: { name: item.value, weight: 'normal' },
        responseType: 'arraybuffer'
      })
      loaded[item.value] = {
        data: response.data,
        // Khmer/OpenType shaping is more reliable when the entire font is embedded.
        subset: !String(item.value || '').toLowerCase().includes('khmer')
      }
    } catch (error) {
      console.warn(`[payslip-designer] could not load font ${item.value}`, error)
    }
  }))

  designerFontNames = Object.keys(loaded)
  const preferredKhmer = chooseKhmerDesignerFont(designerFontNames)
  designerDefaultFontName = designerFontNames.includes('Arial')
    ? 'Arial'
    : (designerFontNames.includes('Times New Roman') ? 'Times New Roman' : (preferredKhmer || designerFontNames[0] || ''))
  khmerFontReady.value = Boolean(preferredKhmer)

  if (designerDefaultFontName && loaded[designerDefaultFontName]) {
    Object.values(loaded).forEach((entry) => { entry.fallback = false })
    loaded[designerDefaultFontName].fallback = true
  }

  designerFonts = loaded
}

function refreshCount(template = null) {
  elementCount.value = countTemplateElements(template || currentTemplate())
}

function mountDesigner(template) {
  if (!designerHost.value) return
  if (designer) {
    designer.destroy()
    designer = null
  }

  const preparedTemplate = prepareTemplateForDesignerFonts(
    template,
    design.pageOrientation,
    designerFontNames,
    designerDefaultFontName
  )

  const options = {
    lang: 'en',
    sidebarOpen: true,
    zoomLevel: 1,
    maxZoom: 400,
    theme: {
      token: {
        colorPrimary: '#0f9f76'
      }
    }
  }
  if (Object.keys(designerFonts).length) options.font = designerFonts

  designer = new Designer({
    domContainer: designerHost.value,
    template: preparedTemplate,
    plugins: createPayslipPdfmePlugins(designerDefaultFontName),
    options
  })

  // pdfme calculates its canvas scale from the container size during mount.
  // Mounting while the Vue v-show host is display:none makes that size 0 and
  // pdfme falls back to its minimum 2% zoom. Re-apply the desired zoom after
  // the visible layout has completed as a second safety net.
  const mountedDesigner = designer
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (designer !== mountedDesigner) return
      if (typeof mountedDesigner.updateOptions === 'function') {
        mountedDesigner.updateOptions({
          zoomLevel: 1,
          sidebarOpen: true,
          maxZoom: 400
        })
      }
      window.dispatchEvent(new Event('resize'))
    })
  })

  designerReady.value = true
  refreshCount(designer.getTemplate())
}

async function loadSource() {
  designerReady.value = false
  loading.value = true
  loadError.value = ''
  try {
    const [{ data: fieldData }, { data: fontData }, source] = await Promise.all([
      api.get('/payslips/fields'),
      api.get('/payslips/fonts'),
      route.params.id
        ? api.get(`/payslips/designs/${route.params.id}`)
        : (route.query.template === 'default' ? api.get('/payslips/default-design') : Promise.resolve(null))
    ])

    fields.value = fieldData.items || []
    await loadDesignerFonts(fontData.items || [])

    if (!khmerFontReady.value) {
      toast.add({
        severity: 'warn',
        summary: 'Khmer font is not available',
        detail: 'Install Khmer OS Content (preferred), Khmer OS Siemreap, Khmer OS Battambang, Khmer UI, Noto Sans Khmer or Khmer OS Moul Light on the Windows backend server.',
        life: 7000
      })
    }

    if (source?.data?.item) {
      let item = source.data.item

      // One-time safe upgrade for the untouched built-in 71-element template that
      // shipped before the reference-paper redesign. The database is not changed
      // until the admin presses Save.
      const legacyBuiltInDefault = Boolean(
        route.params.id &&
        item.name === 'TRAX Default Payslip' &&
        Number(item.templateRevision || 1) < 2 &&
        Array.isArray(item.elements) &&
        item.elements.length === 71
      )
      if (legacyBuiltInDefault) {
        const { data: upgraded } = await api.get('/payslips/default-design')
        item = {
          ...upgraded.item,
          _id: item._id,
          name: item.name,
          active: item.active
        }
        toast.add({
          severity: 'info',
          summary: 'Default payslip upgraded',
          detail: 'The new company-paper layout is loaded. Press Save to keep it.',
          life: 4200
        })
      }

      design._id = route.params.id ? String(item._id || '') : ''
      design.name = route.params.id ? (item.name || 'Payslip Design') : (item.name || 'New Payslip Design')
      design.pageOrientation = item.pageOrientation === 'portrait' ? 'portrait' : 'landscape'
      design.active = route.params.id ? item.active === true : false
      design.templateRevision = Number(item.templateRevision || 1)
      design.pdfmeTemplate = normalizeTemplateForOrientation(
        item.pdfmeTemplate || blankPdfmeTemplate(design.pageOrientation),
        design.pageOrientation
      )
    } else {
      design._id = ''
      design.name = 'New Payslip Design'
      design.pageOrientation = 'landscape'
      design.active = false
      design.templateRevision = 1
      design.pdfmeTemplate = blankPdfmeTemplate('landscape')
    }

    // IMPORTANT: the pdfme host uses v-show. It must be visible before the
    // Designer constructor measures it, otherwise pdfme initializes at ~2%.
    loading.value = false
    await nextTick()
    mountDesigner(design.pdfmeTemplate)
  } catch (error) {
    loading.value = false
    loadError.value = error.response?.data?.message || error.message || 'Unknown error'
    toast.add({ severity: 'error', summary: 'Cannot load Payslip Designer', detail: loadError.value, life: 5000 })
  }
}

function addField(field) {
  if (!designer) return
  const added = addPayrollFieldToTemplate(designer.getTemplate(), field, design.pageOrientation)
  const next = prepareTemplateForDesignerFonts(
    added,
    design.pageOrientation,
    designerFontNames,
    designerDefaultFontName
  )
  designer.updateTemplate(next)
  refreshCount(next)
}

function applyOrientation() {
  if (!designer) {
    design.pdfmeTemplate = prepareTemplateForDesignerFonts(
      design.pdfmeTemplate,
      design.pageOrientation,
      designerFontNames,
      designerDefaultFontName
    )
    return
  }
  const next = prepareTemplateForDesignerFonts(
    designer.getTemplate(),
    design.pageOrientation,
    designerFontNames,
    designerDefaultFontName
  )
  designer.updateTemplate(next)
  refreshCount(next)
}

async function saveDesign() {
  if (!designer) return
  const name = design.name.trim()
  if (!name) {
    toast.add({ severity: 'warn', summary: 'Design name is required', life: 2500 })
    return
  }

  saving.value = true
  try {
    const template = currentTemplate()
    const payload = {
      name,
      pageOrientation: design.pageOrientation,
      active: design.active,
      designerEngine: 'PDFME',
      templateRevision: design.templateRevision,
      pdfmeTemplate: template
    }

    const { data } = design._id
      ? await api.put(`/payslips/designs/${design._id}`, payload)
      : await api.post('/payslips/designs', payload)

    design._id = String(data._id || design._id)
    design.name = data.name || design.name
    design.active = data.active === true
    design.templateRevision = Number(data.templateRevision || design.templateRevision || 1)
    design.pdfmeTemplate = normalizeTemplateForOrientation(data.pdfmeTemplate || template, data.pageOrientation || design.pageOrientation)
    refreshCount(design.pdfmeTemplate)

    if (route.name === 'payslip-design-new' && design._id) {
      await router.replace({ name: 'payslip-design-edit', params: { id: design._id } })
    }

    toast.add({ severity: 'success', summary: 'Payslip design saved', detail: `${elementCount.value} elements`, life: 2200 })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Cannot save design',
      detail: error.response?.data?.message || error.message,
      life: 5000
    })
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'payslip-designs' })
}

onMounted(loadSource)

onBeforeUnmount(() => {
  if (designer) {
    designer.destroy()
    designer = null
  }
})
</script>
