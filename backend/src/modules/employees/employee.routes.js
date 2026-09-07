import { Router } from "express";
import XLSX from "xlsx";
import { Employee } from "./Employee.js";
import { TelegramCredential } from "../auth/TelegramCredential.js";
import {
  createTelegramCredential,
  readTelegramPassword,
  resetTelegramCredential,
} from "../auth/telegramCredential.service.js";
import { allowedEmailDomains } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

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
    dateOfBirth: normalizeDateOnly(body.dateOfBirth, "Date of Birth"),
    department: String(body.department || "").trim(),
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
    const parts = companyEmail.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1])
      throw new AppError("Company email is required and must be valid", 400);
    if (allowedEmailDomains.length && !allowedEmailDomains.includes(parts[1]))
      throw new AppError(
        `Email domain must be one of: ${allowedEmailDomains.join(", ")}`,
        400,
      );
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
  const credentials = await TelegramCredential.find({
    employeeId: { $in: employees.map((x) => x._id) },
  }).select("+passwordEncrypted");
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

async function exportTelegramCredentials(req, res) {
  const employees = await Employee.find({
    active: true,
    preferredDelivery: "TELEGRAM",
  }).sort({ employeeCode: 1 });
  const credentials = await TelegramCredential.find({
    employeeId: { $in: employees.map((x) => x._id) },
    status: "PENDING",
  }).select("+passwordEncrypted");
  const map = new Map(credentials.map((x) => [String(x.employeeId), x]));
  const rows = employees.map((employee) => ({
    "Employee ID": employee.employeeCode,
    "Employee Name": employee.fullName,
    Department: employee.department,
    Position: employee.position,
    "Telegram Verification Password":
      readTelegramPassword(map.get(String(employee._id))) ||
      "Already used / unavailable",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 25 },
    { wch: 25 },
    { wch: 32 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Telegram Credentials");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="e-PaySlip-Telegram-Credentials-${new Date().toISOString().slice(0, 10)}.xlsx"`,
  );
  res.send(buffer);
}

router.get("/export-credentials", asyncHandler(exportTelegramCredentials));
router.get("/export-first-login", asyncHandler(exportTelegramCredentials));

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
          employee: { ...employee.toObject(), accessMode: "NO_PORTAL" },
          issuedCredentials,
        });
    } catch (error) {
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
