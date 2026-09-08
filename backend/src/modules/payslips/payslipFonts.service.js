import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '../../utils/AppError.js'

const FONT_DIRS = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts') : ''
].filter(Boolean)

const DEFINITIONS = [
  {
    value: 'Arial',
    envRegular: 'PAYSLIP_FONT_ARIAL',
    envBold: 'PAYSLIP_FONT_ARIAL_BOLD',
    regularNames: ['arial.ttf'],
    boldNames: ['arialbd.ttf'],
    regularTokens: ['arial'],
    excludeTokens: ['bold', 'black', 'italic', 'narrow'],
    builtInRegular: 'Helvetica',
    builtInBold: 'Helvetica-Bold'
  },
  {
    value: 'Times New Roman',
    envRegular: 'PAYSLIP_FONT_TIMES_NEW_ROMAN',
    envBold: 'PAYSLIP_FONT_TIMES_NEW_ROMAN_BOLD',
    regularNames: ['times.ttf', 'timesnewroman.ttf'],
    boldNames: ['timesbd.ttf', 'timesnewromanbold.ttf'],
    builtInRegular: 'Times-Roman',
    builtInBold: 'Times-Bold'
  },
  {
    value: 'Khmer OS Moul',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_MOUL',
    regularTokens: ['khmerosmoul'],
    excludeTokens: ['light']
  },
  {
    value: 'Khmer OS Moul Light',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_MOUL_LIGHT',
    regularTokens: ['khmerosmoullight']
  },
  {
    value: 'Khmer OS Content',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_CONTENT',
    envBold: 'PAYSLIP_FONT_KHMER_OS_CONTENT_BOLD',
    regularTokens: ['khmeroscontent'],
    excludeTokens: ['bold'],
    boldTokens: ['khmeroscontent', 'bold']
  },
  {
    value: 'Khmer OS Siemreap',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_SIEMREAP',
    regularTokens: ['khmerossiemreap']
  },
  {
    value: 'Khmer OS Battambang',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_BATTAMBANG',
    regularTokens: ['khmerosbattambang']
  },
  {
    value: 'Noto Sans Khmer',
    envRegular: 'PAYSLIP_FONT_NOTO_SANS_KHMER',
    regularTokens: ['notosanskhmer']
  },
  {
    value: 'Khmer UI',
    envRegular: 'PAYSLIP_FONT_KHMER_UI',
    envBold: 'PAYSLIP_FONT_KHMER_UI_BOLD',
    regularNames: ['KhmerUI.ttf', 'khmerui.ttf'],
    boldNames: ['KhmerUIb.ttf', 'khmeruib.ttf'],
    regularTokens: ['khmerui'],
    excludeTokens: ['bold']
  }
]

let cachedFiles = null
const fontAssetCache = new Map()

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function windowsFontFiles() {
  if (cachedFiles) return cachedFiles
  const files = []
  const seen = new Set()

  for (const directory of FONT_DIRS) {
    try {
      for (const file of fs.readdirSync(directory)) {
        if (!/\.(ttf|otf|ttc)$/i.test(file)) continue
        const fullPath = path.join(directory, file)
        const key = fullPath.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        files.push({ file, normalized: normalize(file), fullPath })
      }
    } catch {
      // Font directory may not exist (for example per-user Fonts on some machines).
    }
  }

  cachedFiles = files
  return cachedFiles
}

function explicitPath(envName) {
  const value = String(process.env[envName] || '').trim()
  return value && fs.existsSync(value) ? value : ''
}

function findByNames(names = []) {
  const normalized = new Set(names.map(normalize))
  return windowsFontFiles().find((item) => normalized.has(item.normalized))?.fullPath || ''
}

function findByTokens(tokens = [], excludes = []) {
  const include = tokens.map(normalize)
  const exclude = excludes.map(normalize)
  return windowsFontFiles().find((item) =>
    include.every((token) => item.normalized.includes(token)) &&
    exclude.every((token) => !item.normalized.includes(token))
  )?.fullPath || ''
}

function definitionFor(fontFamily) {
  return DEFINITIONS.find((item) => item.value === fontFamily) || null
}

function resolveDefinition(definition, bold = false) {
  const envName = bold ? definition.envBold : definition.envRegular
  const explicit = envName ? explicitPath(envName) : ''
  if (explicit) return explicit

  const names = bold ? definition.boldNames : definition.regularNames
  const byName = findByNames(names)
  if (byName) return byName

  const tokens = bold && definition.boldTokens?.length
    ? definition.boldTokens
    : definition.regularTokens
  const excludes = bold && definition.boldTokens?.length ? [] : definition.excludeTokens
  if (tokens?.length) {
    const byToken = findByTokens(tokens, excludes)
    if (byToken) return byToken
  }

  if (bold) {
    const regular = resolveDefinition(definition, false)
    if (regular && !String(regular).startsWith('Times-')) return regular
  }

  return bold ? definition.builtInBold : definition.builtInRegular
}

function isFontFile(value) {
  return Boolean(value) && !String(value).startsWith('Times-') && fs.existsSync(value)
}

function designerCompatible(value) {
  return isFontFile(value) && /\.(ttf|otf)$/i.test(value)
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.otf') return 'font/otf'
  if (ext === '.ttf') return 'font/ttf'
  return 'application/octet-stream'
}

export function getPayslipFontCatalog() {
  return DEFINITIONS.map((definition) => {
    const resolved = resolveDefinition(definition, false)
    const fileBacked = isFontFile(resolved)
    return {
      label: definition.value,
      value: definition.value,
      available: Boolean(resolved),
      designerAvailable: designerCompatible(resolved),
      source: fileBacked ? 'SYSTEM' : (resolved ? 'BUILT_IN' : 'MISSING')
    }
  })
}

export function getPayslipFontAsset(fontFamily, fontWeight = 'normal') {
  const definition = definitionFor(fontFamily)
  if (!definition) throw new AppError('Unknown payslip font', 404)

  const resolved = resolveDefinition(definition, fontWeight === 'bold')
  if (!designerCompatible(resolved)) {
    throw new AppError(
      `Payslip font "${fontFamily}" is not available as a TTF/OTF file for the browser designer. Install the font in Windows Fonts or configure its PAYSLIP_FONT_* environment path.`,
      409
    )
  }

  const cacheKey = `${resolved}:${fontWeight}`
  let buffer = fontAssetCache.get(cacheKey)
  if (!buffer) {
    buffer = fs.readFileSync(resolved)
    fontAssetCache.set(cacheKey, buffer)
  }

  return {
    buffer,
    contentType: mimeType(resolved),
    fileName: path.basename(resolved)
  }
}

export function resolvePayslipFont(fontFamily = 'Arial', fontWeight = 'normal') {
  const definition = definitionFor(fontFamily) || DEFINITIONS[0]
  const resolved = resolveDefinition(definition, fontWeight === 'bold')
  if (resolved) return resolved

  // Last chance for Khmer text on Windows if the exact requested Khmer OS font is not installed.
  const fallback = findByTokens(['khmeroscontent']) ||
    findByTokens(['khmerossiemreap']) ||
    findByTokens(['khmerosbattambang']) ||
    findByTokens(['notosanskhmer']) ||
    findByTokens(['khmerui']) ||
    findByTokens(['daunpenh'])
  if (fallback) return fallback

  throw new AppError(
    `Payslip font "${fontFamily}" is not installed on the server. Install it in Windows Fonts or configure the matching PAYSLIP_FONT_* environment path.`,
    409
  )
}
