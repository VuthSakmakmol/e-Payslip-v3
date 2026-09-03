import { PayPeriod } from "../../payPeriods/PayPeriod.js";
import { PayrollBatch } from "../models/PayrollBatch.js";
import { PayrollRecord } from "../models/PayrollRecord.js";
import { PAYROLL_TEMPLATE_VERSION } from "../constants/companyPayrollLayout.js";
import { parsePayrollWorkbook } from "./payrollParser.service.js";
import { createTransientPayroll } from "./transientPayroll.service.js";
import {
  reconcilePayrollRows,
  publicReconciliation,
} from "./payrollReconciliation.service.js";
import { AppError } from "../../../utils/AppError.js";

async function requireCleanReconciliation(rows, expectedCategory) {
  const reconciliation = await reconcilePayrollRows({ rows, expectedCategory });
  if (!reconciliation.clean) {
    throw new AppError("Payroll reconciliation required", 422, {
      reconciliation: publicReconciliation(reconciliation),
    });
  }
  return reconciliation;
}

export async function importLocalPayroll({
  buffer,
  fileName,
  year,
  month,
  payPeriodId,
  userId,
}) {
  const payPeriod = await PayPeriod.findOne({ _id: payPeriodId, active: true });
  if (!payPeriod) throw new AppError("Active pay period not found", 400);

  const duplicate = await PayrollBatch.findOne({
    year,
    month,
    payPeriodId,
    status: { $in: ["READY", "RELEASED"] },
  });
  if (duplicate)
    throw new AppError(
      "A local payroll batch already exists for this month and pay period",
      409,
    );

  const parsed = parsePayrollWorkbook(buffer);
  const reconciliation = await requireCleanReconciliation(parsed.rows, "LOCAL");

  const batch = await PayrollBatch.create({
    staffCategory: "LOCAL",
    year,
    month,
    payPeriodId,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    sourceFileName: fileName,
    employeeCount: parsed.rows.length,
    importedBy: userId,
    status: "READY",
  });

  try {
    await PayrollRecord.insertMany(
      parsed.rows.map((row) => {
        const employee = reconciliation.employeeByCode.get(row.employeeCode);
        return {
          batchId: batch._id,
          employeeId: employee._id,
          employeeCode: row.employeeCode,
          templateVersion: PAYROLL_TEMPLATE_VERSION,
          sourceRow: row.sourceRow,
          values: row.values,
        };
      }),
      { ordered: true },
    );
  } catch (error) {
    await PayrollRecord.deleteMany({ batchId: batch._id });
    await PayrollBatch.deleteOne({ _id: batch._id });
    throw error;
  }

  return batch.populate("payPeriodId");
}

export async function importForeignerPayroll({
  buffer,
  fileName,
  year,
  month,
  userId,
}) {
  const parsed = parsePayrollWorkbook(buffer);
  const reconciliation = await requireCleanReconciliation(
    parsed.rows,
    "FOREIGNER",
  );

  // IMPORTANT: this data is never written to MongoDB. It exists only in process memory until release/expiry.
  return createTransientPayroll({
    staffCategory: "FOREIGNER",
    year,
    month,
    sourceFileName: fileName,
    templateVersion: PAYROLL_TEMPLATE_VERSION,
    importedBy: userId,
    rows: parsed.rows.map((row) => {
      const employee = reconciliation.employeeByCode.get(row.employeeCode);
      return {
        sourceRow: row.sourceRow,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        employee: {
          id: employee._id.toString(),
          fullName: employee.fullName,
          companyEmail: employee.companyEmail,
          telegramChatId: employee.telegramChatId,
          preferredDelivery: employee.preferredDelivery,
        },
        values: row.values,
      };
    }),
  });
}
