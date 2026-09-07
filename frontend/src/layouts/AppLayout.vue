<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark"><i class="pi pi-receipt" /></span>
        <span class="brand-name">e-PaySlip</span>
        <span class="brand-version">V3</span>
      </div>

      <nav class="nav-list">
        <RouterLink v-for="item in menu" :key="item.to" :to="item.to" class="nav-item" v-tooltip.right="item.label">
          <i :class="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user">
          <Avatar :label="userInitial" shape="circle" size="normal" />
          <div class="sidebar-user-copy">
            <strong>{{ auth.user?.name || 'Root Admin' }}</strong>
            <span>{{ auth.user?.role === 'ROOT_ADMIN' ? 'Root Admin' : auth.user?.role }}</span>
          </div>
        </div>
      </div>
    </aside>

    <main class="main-panel">
      <header class="topbar">
        <strong class="topbar-title">{{ routeTitle }}</strong>
        <div class="topbar-actions">
          <Button
            icon="pi pi-user"
            severity="secondary"
            text
            rounded
            v-tooltip.bottom="'Account'"
            @click="toggleMenu"
          />
          <Menu ref="userMenu" :model="userMenuItems" popup />
        </div>
      </header>

      <section class="page-content">
        <RouterView />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Avatar from 'primevue/avatar'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const userMenu = ref()

const menu = [
  { label: 'Dashboard', icon: 'pi pi-home', to: '/' },
  { label: 'Employees', icon: 'pi pi-users', to: '/employees' },
  { label: 'Import Payroll', icon: 'pi pi-file-import', to: '/payroll/import' },
  { label: 'Payroll Batches', icon: 'pi pi-wallet', to: '/payroll/batches' },
  { label: 'Payslip Designs', icon: 'pi pi-palette', to: '/payslip-designs' },
  { label: 'Delivery History', icon: 'pi pi-send', to: '/deliveries' },
  { label: 'Pay Periods', icon: 'pi pi-calendar', to: '/pay-periods' }
]

const routeTitle = computed(() => {
  const exact = menu.find((item) => item.to === route.path)
  if (exact) return exact.label
  if (route.path.startsWith('/payroll/batches/')) return 'Payroll Batch'
  if (route.path.startsWith('/payroll/foreigner/')) return 'Foreigner Preview'
  if (route.path.startsWith('/payslip-designs/')) return 'Payslip Designer'
  return 'e-PaySlip'
})

const userInitial = computed(() => String(auth.user?.name || 'R').trim().charAt(0).toUpperCase())
const userMenuItems = computed(() => [
  { label: auth.user?.name || 'Root Admin', icon: 'pi pi-user', disabled: true },
  { separator: true },
  { label: 'Logout', icon: 'pi pi-sign-out', command: logout }
])

function toggleMenu(event) {
  userMenu.value.toggle(event)
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>
