import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import EmployeesView from "../views/EmployeesView.vue";
import PayPeriodsView from "../views/PayPeriodsView.vue";
import PayrollImportView from "../views/PayrollImportView.vue";
import PayrollBatchesView from "../views/PayrollBatchesView.vue";
import PayrollBatchDetailView from "../views/PayrollBatchDetailView.vue";
import ForeignerPreviewView from "../views/ForeignerPreviewView.vue";
import PayslipDesignerView from "../views/PayslipDesignerView.vue";
import PayslipDesignsView from "../views/PayslipDesignsView.vue";
import DeliveryHistoryView from "../views/DeliveryHistoryView.vue";
const routes = [
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: "/",
    component: AppLayout,
    meta: { adminOnly: true },
    children: [
      { path: "", name: "dashboard", component: DashboardView },
      { path: "employees", name: "employees", component: EmployeesView },
      { path: "pay-periods", name: "pay-periods", component: PayPeriodsView },
      {
        path: "payroll/import",
        name: "payroll-import",
        component: PayrollImportView,
      },
      {
        path: "payroll/batches",
        name: "payroll-batches",
        component: PayrollBatchesView,
      },
      {
        path: "payroll/batches/:id",
        name: "payroll-batch-detail",
        component: PayrollBatchDetailView,
      },
      {
        path: "payroll/foreigner/:id",
        name: "foreigner-preview",
        component: ForeignerPreviewView,
      },
      {
        path: "payslip-designs",
        name: "payslip-designs",
        component: PayslipDesignsView,
      },
      {
        path: "payslip-designs/new",
        name: "payslip-design-new",
        component: PayslipDesignerView,
      },
      {
        path: "payslip-designs/:id",
        name: "payslip-design-edit",
        component: PayslipDesignerView,
      },
      { path: "payslip-designer", redirect: "/payslip-designs" },
      {
        path: "deliveries",
        name: "deliveries",
        component: DeliveryHistoryView,
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];
const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const token = localStorage.getItem("epayslip_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("epayslip_user") || "null");
  } catch {}
  if (to.meta.guestOnly && token && user?.role === "ROOT_ADMIN")
    return { name: "dashboard" };
  if (
    to.matched.some((record) => record.meta.adminOnly) &&
    (!token || user?.role !== "ROOT_ADMIN")
  )
    return { name: "login" };
  return true;
});
export default router;
