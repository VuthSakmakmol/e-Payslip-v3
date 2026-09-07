<template>
  <div class="auth-page">
    <Card class="auth-card">
      <template #content>
        <div class="auth-brand">
          <span class="auth-brand-mark"><i class="pi pi-receipt" /></span>
          <div><strong>e-PaySlip</strong><span>V3</span></div>
        </div>
        <form class="auth-form" @submit.prevent="submit">
          <div class="auth-title">Sign In</div>
          <div class="form-field">
            <label>Admin ID</label>
            <IconField>
              <InputIcon class="pi pi-user" />
              <InputText v-model.trim="loginId" autocomplete="username" class="w-full" placeholder="Root Admin ID" />
            </IconField>
          </div>
          <div class="form-field">
            <label>Password</label>
            <Password v-model="password" :feedback="false" toggleMask inputClass="w-full" class="w-full"
              autocomplete="current-password" />
          </div>
          <Button type="submit" label="Sign In" icon="pi pi-arrow-right" iconPos="right" :loading="loading"
            class="w-full" />
        </form>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const loginId = ref('')
const password = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  try {
    const result = await auth.login(loginId.value, password.value)
    return router.push('/')
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Login failed', detail: error.response?.data?.message || error.message, life: 4500 })
  } finally { loading.value = false }
}
</script>

<style scoped>
.auth-form {
  padding: 22px;
}

.w-full {
  width: 100%;
}
</style>
