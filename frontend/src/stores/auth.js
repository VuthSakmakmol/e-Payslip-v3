import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/client.js'

const TOKEN_KEY = 'epayslip_token'
const USER_KEY = 'epayslip_user'
const ONBOARDING_TOKEN_KEY = 'epayslip_onboarding_token'
const ONBOARDING_EMPLOYEE_KEY = 'epayslip_onboarding_employee'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))
  const onboardingToken = ref(localStorage.getItem(ONBOARDING_TOKEN_KEY) || '')
  const onboardingEmployee = ref(JSON.parse(localStorage.getItem(ONBOARDING_EMPLOYEE_KEY) || 'null'))

  function clearSession() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function clearOnboarding() {
    onboardingToken.value = ''
    onboardingEmployee.value = null
    localStorage.removeItem(ONBOARDING_TOKEN_KEY)
    localStorage.removeItem(ONBOARDING_EMPLOYEE_KEY)
  }

  function setSession(data) {
    token.value = data.token
    user.value = data.user
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    clearOnboarding()
  }

  function setOnboarding(data) {
    onboardingToken.value = data.onboardingToken
    onboardingEmployee.value = data.employee || onboardingEmployee.value
    localStorage.setItem(ONBOARDING_TOKEN_KEY, data.onboardingToken)
    localStorage.setItem(ONBOARDING_EMPLOYEE_KEY, JSON.stringify(onboardingEmployee.value))
  }

  function onboardingHeaders() {
    return { Authorization: `Bearer ${onboardingToken.value}` }
  }

  async function login(loginId, password) {
    clearSession()
    clearOnboarding()

    const { data } = await api.post('/auth/login', { loginId, password })
    if (data.token) setSession(data)
    else if (data.onboardingToken) setOnboarding(data)
    return data
  }

  async function changeFirstPassword(newPassword) {
    const { data } = await api.post(
      '/auth/employee/change-first-password',
      { newPassword },
      { headers: onboardingHeaders() }
    )

    if (data.token) setSession(data)
    else if (data.onboardingToken) setOnboarding(data)
    return data
  }

  async function createTelegramLink() {
    const { data } = await api.post(
      '/auth/employee/telegram-link',
      {},
      { headers: onboardingHeaders() }
    )
    return data
  }

  async function checkOnboardingStatus() {
    const { data } = await api.get('/auth/employee/onboarding-status', {
      headers: onboardingHeaders()
    })
    if (data.complete && data.token) setSession(data)
    return data
  }

  function logout() {
    clearSession()
    clearOnboarding()
  }

  return {
    token,
    user,
    onboardingToken,
    onboardingEmployee,
    login,
    changeFirstPassword,
    createTelegramLink,
    checkOnboardingStatus,
    logout
  }
})
