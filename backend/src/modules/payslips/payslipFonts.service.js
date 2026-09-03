import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '../../utils/AppError.js'

const WINDOWS_FONTS = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')

const DEFINITIONS = [
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
    value: 'Khmer OS Battambang',
    envRegular: 'PAYSLIP_FONT_KHMER_OS_BATTAMBANG',
    regularTokens: ['khmerosbattambang']
  }
]

let cachedFiles = null

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function windowsFontFiles() {
  if (cachedFiles) return cachedFiles
  try {
    cachedFiles = fs.readdirSync(WINDOWS_FONTS)
      .filter((file) => /\.(ttf|otf|ttc)$/i.test(file))
      .map((file) => ({ file, normalized: normalize(file), fullPath: path.join(WINDOWS_FONTS, file) }))
  } catch {
    cachedFiles = []
  }
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

function resolveDefinition(definition, bold = false) {
  const envName = bold ? definition.envBold : definition.envRegular
  const explicit = envName ? explicitPath(envName) : ''
  if (explicit) return explicit

  const names = bold ? definition.boldNames : definition.regularNames
  const byName = findByNames(names)
  if (byName) return byName

  if ((!bold || !definition.boldNames?.length) && definition.regularTokens?.length) {
    const byToken = findByTokens(definition.regularTokens, definition.excludeTokens)
    if (byToken) return byToken
  }

  if (bold) {
    const regular = resolveDefinition(definition, false)
    if (regular) return regular
  }

  return bold ? definition.builtInBold : definition.builtInRegular
}

export function getPayslipFontCatalog() {
  return DEFINITIONS.map((definition) => {
    const resolved = resolveDefinition(definition, false)
    return {
      label: definition.value,
      value: definition.value,
      available: Boolean(resolved),
      source: resolved && !String(resolved).startsWith('Times-') ? 'SYSTEM' : (resolved ? 'BUILT_IN' : 'MISSING')
    }
  })
}

export function resolvePayslipFont(fontFamily = 'Times New Roman', fontWeight = 'normal') {
  const definition = DEFINITIONS.find((item) => item.value === fontFamily) || DEFINITIONS[0]
  const resolved = resolveDefinition(definition, fontWeight === 'bold')
  if (resolved) return resolved

  // Last chance for Khmer text on Windows if the requested Khmer OS font is not installed.
  const fallback = findByTokens(['khmerui']) || findByTokens(['daunpenh']) || findByTokens(['notosanskhmer'])
  if (fallback) return fallback

  throw new AppError(
    `Payslip font "${fontFamily}" is not installed on the server. Install it in Windows Fonts or configure the matching PAYSLIP_FONT_* environment path.`,
    409
  )
}
