<template>
  <div class="auth-page">
    <Card class="auth-card complete-card">
      <template #content>
        <div class="complete-body">
          <template v-if="checking">
            <i class="pi pi-spin pi-spinner complete-icon muted" />
            <strong>Checking...</strong>
          </template>
          <template v-else>
            <i class="pi pi-check-circle complete-icon success" />
            <strong>Telegram Verified</strong>
            <Button
              :label="completed ? 'Open e-PaySlip' : 'Sign In'"
              icon="pi pi-arrow-right"
              iconPos="right"
              class="w-full"
              @click="completed ? goPortal() : goLogin()"
            />
          </template>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Card from "primevue/card";
import Button from "primevue/button";
import { useAuthStore } from "../stores/auth.js";

const router = useRouter();
const auth = useAuthStore();
const checking = ref(true);
const completed = ref(false);

onMounted(async () => {
  if (auth.onboardingToken) {
    try {
      const result = await auth.checkOnboardingStatus();
      completed.value = Boolean(result.complete);
      if (result.nextStep === "CHANGE_PASSWORD")
        return router.replace("/first-login/password");
      if (result.nextStep === "TELEGRAM_VERIFY")
        return router.replace("/first-login/telegram");
    } catch {
      completed.value = false;
    }
  }
  checking.value = false;
});
function goPortal() {
  router.replace("/employee");
}
function goLogin() {
  router.replace("/login");
}
</script>

<style scoped>
.complete-card {
  width: min(390px, 100%);
}
.complete-body {
  min-height: 230px;
  padding: 28px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
}
.complete-icon {
  font-size: 44px;
}
.complete-icon.success {
  color: #0f9f76;
}
.complete-icon.muted {
  color: #94a3b8;
}
.w-full {
  width: 100%;
}
</style>
