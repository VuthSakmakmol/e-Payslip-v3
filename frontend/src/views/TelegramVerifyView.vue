<template>
  <div class="auth-page">
    <Card class="auth-card telegram-auth-card">
      <template #content>
        <div class="auth-brand">
          <span class="auth-brand-mark telegram-mark"
            ><i class="pi pi-send"
          /></span>
          <div>
            <strong>Verify Telegram</strong
            ><span>{{ auth.onboardingEmployee?.employeeCode }}</span>
          </div>
        </div>

        <div class="telegram-body">
          <div class="verify-status">
            <div class="verify-step" :class="{ done: linkReady }">
              <i class="pi pi-link" /><strong>Link Ready</strong>
            </div>
            <div
              class="verify-step"
              :class="{ active: linkReady && !verified }"
            >
              <i class="pi pi-send" /><strong>Press START</strong>
            </div>
            <div class="verify-step" :class="{ done: verified }">
              <i class="pi pi-check" /><strong>Verified</strong>
            </div>
          </div>

          <Button
            v-if="!verified"
            label="Open Telegram"
            icon="pi pi-send"
            :loading="preparing"
            :disabled="!telegramUrl"
            class="w-full"
            @click="openTelegram"
          />

          <Button
            v-if="telegramUrl && !verified"
            icon="pi pi-refresh"
            label="New Link"
            severity="secondary"
            text
            class="w-full"
            :loading="preparing"
            @click="prepareLink"
          />

          <div v-if="verified" class="telegram-success">
            <i class="pi pi-check-circle" />
            <strong>Telegram Verified</strong>
          </div>

          <div v-else class="telegram-waiting">
            <i class="pi pi-spin pi-spinner" />
            <span>Waiting for START</span>
          </div>

          <Button
            label="Cancel"
            severity="secondary"
            text
            class="w-full"
            @click="cancel"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import Card from "primevue/card";
import Button from "primevue/button";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const telegramUrl = ref("");
const preparing = ref(false);
const verified = ref(false);
const linkReady = computed(() => Boolean(telegramUrl.value));
let timer = null;
let checking = false;
let redirectTimer = null;

async function prepareLink() {
  preparing.value = true;
  try {
    const result = await auth.createTelegramLink();
    if (result.alreadyVerified) return checkStatus();
    telegramUrl.value = result.url || "";
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Telegram",
      detail: error.response?.data?.message || error.message,
      life: 4500,
    });
  } finally {
    preparing.value = false;
  }
}

async function openTelegram() {
  if (!telegramUrl.value) return;
  const popup = window.open(telegramUrl.value, "_blank");
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      /* browser restriction */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(telegramUrl.value);
    toast.add({
      severity: "warn",
      summary: "Popup blocked",
      detail: "Telegram link copied",
      life: 4500,
    });
  } catch {
    toast.add({
      severity: "warn",
      summary: "Allow popups for e-PaySlip",
      life: 4500,
    });
  }
}

async function checkStatus() {
  if (checking || verified.value) return;
  checking = true;
  try {
    const result = await auth.checkOnboardingStatus();
    if (result.complete) {
      verified.value = true;
      if (timer) clearInterval(timer);
      redirectTimer = setTimeout(() => router.replace("/employee"), 700);
      return;
    }
    if (result.nextStep === "CHANGE_PASSWORD") {
      if (timer) clearInterval(timer);
      router.replace("/first-login/password");
    }
  } catch {
    /* API interceptor handles expired onboarding */
  } finally {
    checking = false;
  }
}

function cancel() {
  auth.logout();
  router.replace("/login");
}

onMounted(async () => {
  await prepareLink();
  await checkStatus();
  timer = setInterval(checkStatus, 1500);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (redirectTimer) clearTimeout(redirectTimer);
});
</script>

<style scoped>
.telegram-auth-card {
  width: min(460px, 100%);
}
.telegram-mark {
  background: #229ed9;
}
.telegram-body {
  padding: 18px 22px 22px;
  display: grid;
  gap: 9px;
}
.telegram-waiting,
.telegram-success {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11.5px;
  color: #718096;
}
.telegram-success {
  color: #0d8c69;
}
.telegram-success i {
  font-size: 18px;
}
.w-full {
  width: 100%;
}
</style>
