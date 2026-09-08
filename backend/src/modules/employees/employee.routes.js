import { Router } from "express";
import XLSX from "xlsx";
import multer from "multer";
import { Employee } from "./Employee.js";
import { TelegramCredential } from "../auth/TelegramCredential.js";
import { PayslipCredential } from "../auth/PayslipCredential.js";
import { PayrollRecord } from "../payroll/models/PayrollRecord.js";
import { DeliveryLog } from "../delivery/DeliveryLog.js";
import {
  createTelegramCredential,
  readTelegramPassword,
  resetTelegramCredential,
} from "../auth/telegramCredential.service.js";
import {
  createPayslipCredential,
  payslipPasswordsForEmployees,
  resetPayslipPassword,
} from "../auth/payslipCredential.service.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  buildEmployeeImportTemplate,
  parseEmployeeImportWorkbook,
} from "./employeeImport.service.js";

const router = Router();
const employeeImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const valid = /\.(xlsx|xls)$/i.test(file.originalname || "");
    callback(valid ? null : new AppError("Employee import must be an Excel .xlsx or .xls file", 400), valid);
  },
});

function normalizeDateOnly(value, label) {
  if (!value) throw new AppError(`${label} is required`, 400);
  const match =
    typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new AppError(`${label} is invalid`, 400);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new AppError(`${label} is invalid`, 400);
  return date;
}

function validateEmployeeBody(body) {
  const preferredDelivery = String(body.preferredDelivery || "").toUpperCase();
  const companyEmail =
    preferredDelivery === "EMAIL"
      ? String(body.companyEmail || "")
          .trim()
          .toLowerCase()
      : "";
  const value = {
    employeeCode: String(body.employeeCode || "").trim(),
    fullName: String(body.fullName || "").trim(),
    staffCategory: String(body.staffCategory || "").toUpperCase(),
    dateJoin: normalizeDateOnly(body.dateJoin, "Date Join"),
    department: String(body.department || "").trim(),
    line: String(body.line || "").trim(),
    position: String(body.position || "").trim(),
    preferredDelivery,
    companyEmail,
    active: body.active !== false,
  };
  if (!value.employeeCode) throw new AppError("Employee ID is required", 400);
  if (!value.fullName) throw new AppError("Full Name is required", 400);
  if (!value.department) throw new AppError("Department is required", 400);
  if (!value.position) throw new AppError("Position is required", 400);
  if (!["LOCAL", "FOREIGNER"].includes(value.staffCategory))
    throw new AppError("Employee Category must be LOCAL or FOREIGNER", 400);
  if (!["EMAIL", "TELEGRAM"].includes(preferredDelivery))
    throw new AppError("Payslip delivery must be EMAIL or TELEGRAM", 400);
  if (preferredDelivery === "EMAIL") {
    // Email delivery may use either a company address or a personal address.
    // Keep the legacy `companyEmail` storage key for backward compatibility,
    // but validate it as a normal email address without restricting its domain.
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail);
    if (!validEmail)
      throw new AppError("Email address is required and must be valid", 400);
  }
  return value;
}

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
  const [credentials, pdfPasswords] = await Promise.all([
    TelegramCredential.find({
      employeeId: { $in: employees.map((x) => x._id) },
    }).select("+passwordEncrypted"),
    payslipPasswordsForEmployees(employees),
  ]);
  const map = new Map(credentials.map((x) => [String(x.employeeId), x]));
  return employees.map((employee) => {
    const credential = map.get(String(employee._id));
    const base = employee.toObject();
    base.telegramProfile = safeProfile(employee);
    const temporaryPassword = readTelegramPassword(credential);
    return {
      ...base,
      accessMode: "NO_PORTAL",
      accountStatus: "NO_PORTAL",
      pdfPassword: pdfPasswords.get(String(employee._id)) || "",
      telegramVerified: Boolean(
        employee.telegramChatId && credential?.status === "USED",
      ),
      telegramVerificationStatus:
        employee.preferredDelivery === "TELEGRAM"
          ? credential?.status || "MISSING"
          : "NOT_REQUIRED",
      temporaryPassword,
      temporaryPasswordAvailable: Boolean(temporaryPassword),
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
  const [telegramCredentials, pdfPasswords] = await Promise.all([
    TelegramCredential.find({
      employeeId: { $in: employees.map((x) => x._id) },
      status: "PENDING",
    }).select("+passwordEncrypted"),
    payslipPasswordsForEmployees(employees),
  ]);
  const telegramMap = new Map(telegramCredentials.map((x) => [String(x.employeeId), x]));
  const rows = employees.map((employee) => ({
    "Employee ID": employee.employeeCode,
    "Employee Name": employee.fullName,
    Department: employee.department,
    Line: employee.line || "",
    Position: employee.position,
    "Delivery Channel": employee.preferredDelivery,
    "Email Address": employee.companyEmail || "",
    "PDF Password": pdfPasswords.get(String(employee._id)) || "",
    "Telegram Verification Password":
      employee.preferredDelivery === "TELEGRAM"
        ? readTelegramPassword(telegramMap.get(String(employee._id))) || "Already used / unavailable"
        : "",
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
    { wch: 16 },
    { wch: 32 },
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

    const parsedRows = parseEmployeeImportWorkbook(req.file.buffer);
    const normalized = [];
    const errors = [];

    for (const row of parsedRows) {
      try {
        if (typeof row.body.active !== "boolean") {
          throw new AppError("Status must be ACTIVE or INACTIVE", 400);
        }
        normalized.push({ rowNumber: row.rowNumber, input: validateEmployeeBody(row.body) });
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          column: "Employee",
          employeeCode: row.body.employeeCode || "",
          message: error.message || "Invalid employee row",
        });
      }
    }

    const seen = new Map();
    for (const row of normalized) {
      const key = row.input.employeeCode.toUpperCase();
      if (seen.has(key)) {
        errors.push({
          row: row.rowNumber,
          column: "Employee ID",
          employeeCode: row.input.employeeCode,
          message: `Duplicate Employee ID in import file (also row ${seen.get(key)})`,
        });
      } else {
        seen.set(key, row.rowNumber);
      }
    }

    if (!errors.length) {
      const employeeCodes = normalized.map((row) => row.input.employeeCode);
      const existing = await Employee.find({ employeeCode: { $in: employeeCodes } })
        .select("employeeCode")
        .lean();
      const existingSet = new Set(existing.map((employee) => String(employee.employeeCode).toUpperCase()));
      for (const row of normalized) {
        if (existingSet.has(row.input.employeeCode.toUpperCase())) {
          errors.push({
            row: row.rowNumber,
            column: "Employee ID",
            employeeCode: row.input.employeeCode,
            message: "Employee ID already exists in Employee Master",
          });
        }
      }
    }

    if (errors.length) {
      throw new AppError(
        "Employee import blocked. Fix all errors and upload the file again. No employees were created.",
        422,
        errors,
      );
    }

    const createdEmployeeIds = [];
    let emailEmployees = 0;
    let telegramEmployees = 0;
    let inactiveEmployees = 0;

    try {
      for (const row of normalized) {
        const employee = await Employee.create({
          ...row.input,
          telegramChatId: "",
          telegramProfile: null,
        });
        createdEmployeeIds.push(employee._id);
        await createPayslipCredential(employee);

        if (!employee.active) inactiveEmployees += 1;
        if (employee.preferredDelivery === "TELEGRAM") {
          telegramEmployees += 1;
          await createTelegramCredential(employee);
        } else {
          emailEmployees += 1;
        }
      }
    } catch (error) {
      if (createdEmployeeIds.length) {
        await Promise.all([
          TelegramCredential.deleteMany({ employeeId: { $in: createdEmployeeIds } }),
          PayslipCredential.deleteMany({ employeeId: { $in: createdEmployeeIds } }),
        ]);
        await Employee.deleteMany({ _id: { $in: createdEmployeeIds } });
      }
      throw error;
    }

    res.status(201).json({
      imported: normalized.length,
      emailEmployees,
      telegramEmployees,
      inactiveEmployees,
      message: `${normalized.length} employees imported successfully`,
    });
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
      TelegramCredential.countDocuments({ status: "PENDING" }),
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
    const credential = await TelegramCredential.findOne({
      employeeId: employee._id,
    });
    res.json({
      employee: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        department: employee.department,
        line: employee.line || "",
        position: employee.position,
      },
      verified: Boolean(
        employee.telegramChatId && credential?.status === "USED",
      ),
      activeChatId: employee.telegramChatId || "",
      profile: safeProfile(employee),
    });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = validateEmployeeBody(req.body);
    if (await Employee.exists({ employeeCode: input.employeeCode }))
      throw new AppError("Employee ID already exists", 409);
    const employee = await Employee.create({
      ...input,
      telegramChatId: "",
      telegramProfile: null,
    });
    try {
      const pdfCredential = await createPayslipCredential(employee);
      let issuedCredentials = null;
      if (input.preferredDelivery === "TELEGRAM") {
        const created = await createTelegramCredential(employee);
        issuedCredentials = {
          type: "TELEGRAM_VERIFICATION",
          employeeCode: employee.employeeCode,
          password: created.password,
        };
      }
      res
        .status(201)
        .json({
          employee: {
            ...employee.toObject(),
            accessMode: "NO_PORTAL",
            pdfPassword: pdfCredential.password,
          },
          pdfPassword: pdfCredential.password,
          issuedCredentials,
        });
    } catch (error) {
      await Promise.all([
        TelegramCredential.deleteMany({ employeeId: employee._id }),
        PayslipCredential.deleteMany({ employeeId: employee._id }),
      ]);
      await Employee.deleteOne({ _id: employee._id });
      throw error;
    }
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = validateEmployeeBody(req.body);
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
    let credential = await TelegramCredential.findOne({
      employeeId: employee._id,
    }).select("+passwordHash +passwordFingerprint +passwordEncrypted");
    let issuedCredentials = null;
    if (input.preferredDelivery === "EMAIL") {
      employee.telegramChatId = "";
      if (employee.telegramProfile)
        employee.telegramProfile.unlinkedAt = new Date();
      if (credential)
        await TelegramCredential.deleteOne({ _id: credential._id });
    } else if (!credential) {
      const created = await createTelegramCredential(employee);
      credential = created.credential;
      issuedCredentials = {
        type: "TELEGRAM_VERIFICATION",
        employeeCode: employee.employeeCode,
        password: created.password,
      };
    } else if (!input.active) {
      credential.status = "DISABLED";
      await credential.save();
    } else if (credential.status === "DISABLED") {
      issuedCredentials = {
        type: "TELEGRAM_VERIFICATION",
        employeeCode: employee.employeeCode,
        password: await resetTelegramCredential(credential),
      };
    }
    if (oldDelivery !== input.preferredDelivery) employee.telegramChatId = "";
    await employee.save();
    res.json({
      ...employee.toObject(),
      accessMode: "NO_PORTAL",
      issuedCredentials,
    });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);

    const [payrollRecordCount, deliveryLogCount] = await Promise.all([
      PayrollRecord.countDocuments({ employeeId: employee._id }),
      DeliveryLog.countDocuments({ employeeId: employee._id }),
    ]);

    if (payrollRecordCount > 0 || deliveryLogCount > 0) {
      throw new AppError(
        "This employee already has payroll or delivery history and cannot be permanently deleted. Set the employee to Inactive instead so historical records remain intact.",
        409,
        {
          payrollRecords: payrollRecordCount,
          deliveryLogs: deliveryLogCount,
        },
      );
    }

    await Promise.all([
      TelegramCredential.deleteMany({ employeeId: employee._id }),
      PayslipCredential.deleteMany({ employeeId: employee._id }),
    ]);
    await Employee.deleteOne({ _id: employee._id });

    res.json({
      deleted: true,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
    });
  }),
);

router.post(
  "/:id/reset-pdf-password",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    if (!employee.active)
      throw new AppError("Activate the employee before resetting the PDF password", 409);

    const password = await resetPayslipPassword(employee);
    res.json({
      credentialType: "PDF_PASSWORD",
      employeeCode: employee.employeeCode,
      password,
      pdfPassword: password,
    });
  }),
);

router.post(
  "/:id/reset-temporary-password",
  asyncHandler(async (req, res) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw new AppError("Employee not found", 404);
    if (employee.preferredDelivery !== "TELEGRAM")
      throw new AppError(
        "Email employees do not have a verification password",
        409,
      );
    if (!employee.active)
      throw new AppError(
        "Activate the employee before resetting the password",
        409,
      );
    employee.telegramChatId = "";
    if (employee.telegramProfile)
      employee.telegramProfile.unlinkedAt = new Date();
    await employee.save();
    let credential = await TelegramCredential.findOne({
      employeeId: employee._id,
    }).select("+passwordHash +passwordFingerprint +passwordEncrypted");
    let password;
    if (!credential)
      ({ credential, password } = await createTelegramCredential(employee));
    else password = await resetTelegramCredential(credential);
    res.json({
      credentialType: "TELEGRAM_VERIFICATION",
      employeeCode: employee.employeeCode,
      password,
      temporaryPassword: password,
    });
  }),
);

export default router;
