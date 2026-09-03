import axios from 'axios'

function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim()

  // If a real absolute API URL was explicitly configured, use it.
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '')

  // Local browser development must talk directly to Express on port 4000.
  // This avoids a missing/stale Vite proxy causing /api/* to return 404.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000/api'
    }
  }

  // Public frontend/tunnel deployments can stay same-origin and let Vite/nginx
  // proxy /api to the backend.
  return configured || '/api'
}

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000
})

api.interceptors.request.use((config) => {
  if (!config.headers?.Authorization) {
    const token = localStorage.getItem('epayslip_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('epayslip_token')
      localStorage.removeItem('epayslip_user')
      localStorage.removeItem('epayslip_onboarding_token')
      localStorage.removeItem('epayslip_onboarding_employee')
      if (!window.location.pathname.includes('/login')) window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
