import vue from '@vitejs/plugin-vue'
import config from '../vite.config.js'

const configuredPlugins = (config.plugins || []).map((plugin) => plugin?.name).filter(Boolean)

if (typeof vue !== 'function') {
  throw new Error('@vitejs/plugin-vue did not load correctly')
}

if (!configuredPlugins.some((name) => name.includes('vue'))) {
  throw new Error(`Vue plugin is not active in vite.config.js. Plugins: ${configuredPlugins.join(', ')}`)
}

console.log('[verify] @vitejs/plugin-vue installed')
console.log(`[verify] Vite plugins: ${configuredPlugins.join(', ')}`)
console.log('[verify] Vue/Vite configuration OK')
