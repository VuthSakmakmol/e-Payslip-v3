import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import LoginView from '../views/LoginView.vue'
import FirstPasswordView from '../views/FirstPasswordView.vue'
import TelegramVerifyView from '../views/TelegramVerifyView.vue'
import TelegramCompleteView from '../views/TelegramCompleteView.vue'
import EmployeePortalView from '../views/EmployeePortalView.vue'
import DashboardView from '../views/DashboardView.vue'
import EmployeesView from '../views/EmployeesView.vue'
import PayPeriodsView from '../views/PayPeriodsView.vue'
import PayrollImportView from '../views/PayrollImportView.vue'
import PayrollBatchesView from '../views/PayrollBatchesView.vue'
import PayrollBatchDetailView from '../views/PayrollBatchDetailView.vue'
import ForeignerPreviewView from '../views/ForeignerPreviewView.vue'
import PayslipDesignerView from '../views/PayslipDesignerView.vue'
import DeliveryHistoryView from '../views/DeliveryHistoryView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true, guestOnly: true } },
  { path: '/first-login/password', name: 'first-password', component: FirstPasswordView, meta: { onboarding: true } },
  { path: '/first-login/telegram', name: 'telegram-verify', component: TelegramVerifyView, meta: { onboarding: true } },
  { path: '/telegram/complete', name: 'telegram-complete', component: TelegramCompleteView, meta: { public: true } },
  { path: '/employee', name: 'employee-portal', component: EmployeePortalView, meta: { employeeOnly: true } },
  {
    path: '/',
    component: AppLayout,
    meta: { adminOnly: true },
    children: [
      { path: '', name: 'dashboard', component: DashboardView },
      { path: 'employees', name: 'employees', component: EmployeesView },
      { path: 'pay-periods', name: 'pay-periods', component: PayPeriodsView },
      { path: 'payroll/import', name: 'payroll-import', component: PayrollImportView },
      { path: 'payroll/batches', name: 'payroll-batches', component: PayrollBatchesView },
      { path: 'payroll/batches/:id', name: 'payroll-batch-detail', component: PayrollBatchDetailView },
      { path: 'payroll/foreigner/:id', name: 'foreigner-preview', component: ForeignerPreviewView },
      { path: 'payslip-designer', name: 'payslip-designer', component: PayslipDesignerView },
      { path: 'deliveries', name: 'deliveries', component: DeliveryHistoryView }
    ]
  },
  { path: '/leave/user/:pathMatch(.*)*', redirect: '/' },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHistory(), routes })

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem('epayslip_user') || 'null')
  } catch {
    return null
  }
}

router.beforeEach((to) => {
  const token = localStorage.getItem('epayslip_token')
  const onboardingToken = localStorage.getItem('epayslip_onboarding_token')
  const user = storedUser()
  const adminOnly = to.matched.some((record) => record.meta.adminOnly)
  const employeeOnly = to.matched.some((record) => record.meta.employeeOnly)
  const onboarding = to.matched.some((record) => record.meta.onboarding)

  if (onboarding) {
    if (!onboardingToken) return { name: 'login' }
    return true
  }

  if (to.meta.guestOnly && token) {
    return user?.role === 'EMPLOYEE' ? { name: 'employee-portal' } : { name: 'dashboard' }
  }

  if (adminOnly) {
    if (!token) return { name: 'login' }
    if (user?.role !== 'ROOT_ADMIN') return { name: 'employee-portal' }
  }

  if (employeeOnly) {
    if (!token) return { name: 'login' }
    if (user?.role !== 'EMPLOYEE') return { name: 'dashboard' }
  }

  return true
})

export default router
