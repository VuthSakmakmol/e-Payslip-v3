import { Router } from "express";
import XLSX from "xlsx";
import multer from "multer";
import { Employee } from "./Employee.js";
import { PayslipCredential } from "../auth/PayslipCredential.js";
import { DeliveryLog } from "../delivery/DeliveryLog.js";
import {
  createPayslipCredential,
  ensurePayslipPassword,
  payslipPasswordsForEmployees,
  resetPayslipPassword,
} from "../auth/payslipCredential.service.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { buildEmployeeImportTemplate } from "./employeeImport.service.js";
import { validateEmployeeInput } from "./employeeValidation.service.js";
import {
  startEmployeeImportJob,
  getEmployeeImportJob,
  cancelEmployeeImportJob,
} from "./employeeImportJob.service.js";

const router = Router();
const employeeImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const valid = /\.(xlsx|xls)$/i.test(file.originalname || "");
    callback(valid ? null : new AppError("Employee import must be an Excel .xlsx or .xls file", 400), valid);
  },
});

function safeProfile(employee) {
  const value =
    employee.telegramProfile?.toObject?.() || employee.telegramProfile || null;
  if (value) {
    delete value.fromSnapshot;
    delete value.chatSnapshot;
  }
  return value;
}

async function decorate(employees) {
  const passwords = await payslipPasswordsForEmployees(employees);
  return employees.map((employee) => {
    const base = employee.toObject();
    base.telegramProfile = safeProfile(employee);
    const password = passwords.get(String(employee._id)) || "";
    const telegramVerified = Boolean(employee.telegramChatId);
    return {
      ...base,
      accessMode: "NO_PORTAL",
      accountStatus: "NO_PORTAL",
      pdfPassword: password,
      employeePassword: password,
      telegramVerified,
      telegramVerificationStatus:
        employee.preferredDelivery === "TELEGRAM"
          ? telegramVerified ? "LINKED" : "PENDING"
          : "NOT_REQUIRED",
      // Backward-compatible alias: Telegram now uses the exact same six-digit password.
      temporaryPassword:
        employee.preferredDelivery === "TELEGRAM" && !telegramVerified ? password : null,
      temporaryPasswordAvailable:
        employee.preferredDelivery === "TELEGRAM" && !telegramVerified && Boolean(password),
      telegramSummary: {
        username: base.telegramProfile?.username || "",
        userId: base.telegramProfile?.userId || "",
        chatId: employee.telegramChatId || "",
        linkedAt: base.telegramProfile?.linkedAt || null,
      },
    };
  });
}

async function exportEmployeeCredentials(req, res) {
  const employees = await Employee.find({ active: true }).sort({ employeeCode: 1 });
  const passwords = await payslipPasswordsForEmployees(employees);
  const rows = employees.map((employee) => ({
    "Employee ID": employee.employeeCode,
    "Employee Name": employee.fullName,
    Department: employee.department,
    Line: employee.line || "",
    Position: employee.position,
    "Delivery Channel": employee.preferredDelivery,
    "Email Address": employee.companyEmail || "",
    "e-PaySlip Password": passwords.get(String(employee._id)) || "",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 25 },
    { wch: 20 },
    { wch: 25 },
    { wch: 18 },
    { wch: 34 },
    { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Employee Credentials");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="e-PaySlip-Employee-Credentials-${new Date().toISOString().slice(0, 10)}.xlsx"`,
  );
  res.send(buffer);
}

router.get(
  "/import-template",
  asyncHandler(async (req, res) => {
    const buffer = buildEmployeeImportTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="e-PaySlip-Employee-Import-Template.xlsx"',
    );
    res.send(buffer);
  }),
);

router.post(
  "/import",
  employeeImportUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file?.buffer) throw new AppError("Employee import file is required", 400);

    const job = startEmployeeImportJob({
      buffer: req.file.buffer,
      fileName: req.file.originalname || "employee-import.xlsx",
    });

    // 202 means the file was accepted and processing continues in the background.
    // The frontend follows the real progress through /import-jobs/:jobId.
    res.status(202).json({
      jobId: job.id,
      job,
      message: "Employee import started",
    });
  }),
);

router.get(
  "/import-jobs/:jobId",
  asyncHandler(async (req, res) => {
    res.json(getEmployeeImportJob(req.params.jobId));
  }),
);

router.post(
  "/import-jobs/:jobId/cancel",
  asyncHandler(async (req, res) => {
    res.json(cancelEmployeeImportJob(req.params.jobId));
  }),
);

router.get("/export-credentials", asyncHandler(exportEmployeeCredentials));
router.get("/export-first-login", asyncHandler(exportEmployeeCredentials));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const conditions = [];
    const search = String(req.query.search || "").trim();
    if (search)
      conditions.push({
        $or: [
          "employeeCode",
          "fullName",
          "department",
          "line",
          "position",
          "companyEmail",
          "telegramProfile.username",
        ].map((key) => ({ [key]: { $regex: search, $options: "i" } })),
      });
    const category = String(req.query.staffCategory || "").toUpperCase();
    const delivery = String(req.query.preferredDelivery || "").toUpperCase();
    if (["LOCAL", "FOREIGNER"].includes(category))
      conditions.push({ staffCategory: category });
    if (["EMAIL", "TELEGRAM"].includes(delivery))
      conditions.push({ preferredDelivery: delivery });
    const filter = conditions.length ? { $and: conditions } : {};
    const [
      employees,
      total,
      totalEmployees,
      activeEmployees,
      telegramLinked,
      waitingVerification,
    ] = await Promise.all([
      Employee.find(filter)
        .sort({ employeeCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Employee.countDocuments(filter),
      Employee.countDocuments(),
      Employee.countDocuments({ active: true }),
      Employee.countDocuments({
        preferredDelivery: "TELEGRAM",
        telegramChatId: { $ne: "" },
      }),
      Employee.countDocuments({
        preferredDelivery: "TELEGRAM",
        active: true,
        $or: [{ telegramChatId: "" }, { telegramChatId: { $exists: false } }],
      }),
    ]);
    res.json({
      items: await decorate(employees),
      total,
      page,
      limit,
      summary: {
        totalEmployees,
        activeEmployees,
        telegramLinked,
        firstLogin: waitingVerification,
      },
    });
  }),
);

router.get(
  "/:id/telegram-profile",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    res.json({
      employee: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        department: employee.department,
        line: employee.line || "",
        position: employee.position,
      },
      verified: Boolean(employee.telegramChatId),
      activeChatId: employee.telegramChatId || "",
      profile: safeProfile(employee),
    });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = validateEmployeeInput(req.body);
    if (await Employee.exists({ employeeCode: input.employeeCode }))
      throw new AppError("Employee ID already exists", 409);
    const employee = await Employee.create({
      ...input,
      telegramChatId: "",
      telegramProfile: null,
    });
    try {
      const created = await createPayslipCredential(employee);
      const issuedCredentials = {
        type: "EMPLOYEE_PASSWORD",
        employeeCode: employee.employeeCode,
        password: created.password,
      };
      res.status(201).json({
        employee: {
          ...employee.toObject(),
          accessMode: "NO_PORTAL",
          pdfPassword: created.password,
          employeePassword: created.password,
        },
        pdfPassword: created.password,
        employeePassword: created.password,
        issuedCredentials,
      });
    } catch (error) {
      await PayslipCredential.deleteMany({ employeeId: employee._id });
      await Employee.deleteOne({ _id: employee._id });
      throw error;
    }
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = validateEmployeeInput(req.body);
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    if (
      await Employee.exists({
        employeeCode: input.employeeCode,
        _id: { $ne: employee._id },
      })
    )
      throw new AppError("Employee ID already exists", 409);

    const oldDelivery = employee.preferredDelivery;
    Object.assign(employee, input);

    // The shared password is never replaced just because delivery channel changes.
    // Telegram linking uses the same six-digit password already assigned to the employee.
    if (input.preferredDelivery === "EMAIL" || oldDelivery !== input.preferredDelivery) {
      employee.telegramChatId = "";
      if (employee.telegramProfile) employee.telegramProfile.unlinkedAt = new Date();
    }

    await employee.save();
    const password = await ensurePayslipPassword(employee);
    res.json({
      ...employee.toObject(),
      accessMode: "NO_PORTAL",
      pdfPassword: password,
      employeePassword: password,
      issuedCredentials: null,
    });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);

    const deliveryLogCount = await DeliveryLog.countDocuments({ employeeId: employee._id });

    if (deliveryLogCount > 0) {
      throw new AppError(
        "This employee already has delivery history and cannot be permanently deleted. Set the employee to Inactive instead so the audit history remains intact.",
        409,
        {
          deliveryLogs: deliveryLogCount,
        },
      );
    }

    await PayslipCredential.deleteMany({ employeeId: employee._id });
    await Employee.deleteOne({ _id: employee._id });

    res.json({
      deleted: true,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
    });
  }),
);

async function resetSharedEmployeePassword(employee) {
  if (!employee.active)
    throw new AppError("Activate the employee before resetting the password", 409);

  // One password protects PDFs and performs first-time Telegram verification.
  // Resetting it therefore unlinks Telegram so a Telegram employee must verify
  // again using the newly generated shared password.
  if (employee.preferredDelivery === "TELEGRAM") {
    employee.telegramChatId = "";
    if (employee.telegramProfile) employee.telegramProfile.unlinkedAt = new Date();
    await employee.save();
  }

  const password = await resetPayslipPassword(employee);
  return {
    credentialType: "EMPLOYEE_PASSWORD",
    employeeCode: employee.employeeCode,
    password,
    pdfPassword: password,
    employeePassword: password,
    temporaryPassword: password,
  };
}

router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    res.json(await resetSharedEmployeePassword(employee));
  }),
);

// Backward-compatible aliases for browsers that still have the previous frontend cached.
router.post(
  "/:id/reset-pdf-password",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    res.json(await resetSharedEmployeePassword(employee));
  }),
);

router.post(
  "/:id/reset-temporary-password",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    res.json(await resetSharedEmployeePassword(employee));
  }),
);

export default router;
