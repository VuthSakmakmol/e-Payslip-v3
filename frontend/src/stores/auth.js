import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client.js";
const TOKEN_KEY = "epayslip_token";
const USER_KEY = "epayslip_user";
export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || "");
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || "null"));
  function logout() {
    token.value = "";
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("epayslip_onboarding_token");
    localStorage.removeItem("epayslip_onboarding_employee");
  }
  async function login(loginId, password) {
    logout();
    const { data } = await api.post("/auth/login", { loginId, password });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data;
  }
  return { token, user, login, logout };
});
