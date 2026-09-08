import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

function transporter() {
  if (!env.SMTP_HOST) throw new AppError("SMTP is not configured", 400);
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
}

export async function sendPayslipEmail({
  to,
  employeeName,
  periodLabel,
  pdfBuffer,
  filename,
  passwordProtected = false,
}) {
  if (!to) throw new AppError("Employee email is missing", 400);
  return transporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `e-PaySlip - ${periodLabel}`,
    text: passwordProtected
      ? `Dear ${employeeName},\n\nPlease find your password-protected payslip attached. Open it with your personal 6-digit e-PaySlip PDF password provided separately by HR. For security, the password is not included in this email.\n\nRegards,\ne-PaySlip`
      : `Dear ${employeeName},\n\nPlease find your payslip attached.\n\nRegards,\ne-PaySlip`,
    attachments: [
      { filename, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });
}
