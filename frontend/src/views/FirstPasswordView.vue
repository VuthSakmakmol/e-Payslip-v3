<template>
  <div class="auth-page">
    <Card class="auth-card">
      <template #content>
        <div class="auth-brand">
          <span class="auth-brand-mark"><i class="pi pi-key" /></span>
          <div><strong>e-PaySlip</strong><span>FIRST LOGIN</span></div>
        </div>
        <form class="auth-form" @submit.prevent="submit">
          <div class="auth-title">Create Password</div>
          <div class="auth-identity">
            <Tag
              :value="auth.onboardingEmployee?.employeeCode || 'Employee'"
              severity="secondary"
            />
            <strong>{{ auth.onboardingEmployee?.name }}</strong>
          </div>
          <div class="form-field">
            <label>New Password</label>
            <Password
              v-model="newPassword"
              toggleMask
              class="w-full"
              inputClass="w-full"
              autocomplete="new-password"
            />
          </div>
          <div class="form-field">
            <label>Confirm Password</label>
            <Password
              v-model="confirmPassword"
              :feedback="false"
              toggleMask
              class="w-full"
              inputClass="w-full"
              autocomplete="new-password"
            />
          </div>
          <Button
            type="submit"
            label="Continue"
            icon="pi pi-arrow-right"
            iconPos="right"
            :loading="loading"
            class="w-full"
          />
        </form>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Card from "primevue/card";
import Password from "primevue/password";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const newPassword = ref("");
const confirmPassword = ref("");
const loading = ref(false);

async function submit() {
  if (newPassword.value.length < 8)
    return toast.add({
      severity: "warn",
      summary: "Use at least 8 characters",
      life: 3000,
    });
  if (newPassword.value !== confirmPassword.value)
    return toast.add({
      severity: "warn",
      summary: "Passwords do not match",
      life: 3000,
    });
  loading.value = true;
  try {
    const result = await auth.changeFirstPassword(newPassword.value);
    if (result.nextStep === "TELEGRAM_VERIFY")
      return router.replace("/first-login/telegram");
    router.replace("/employee");
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Cannot save password",
      detail: error.response?.data?.message || error.message,
      life: 4500,
    });
  } finally {
    loading.value = false;
  }
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
