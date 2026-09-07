import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
export function normalizeLoginId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}
export function issueSessionToken({ subject, role, accountType }) {
  return jwt.sign({ role, accountType }, env.JWT_SECRET, {
    subject: String(subject),
    expiresIn: env.JWT_EXPIRES_IN,
  });
}
export function rootAdminPayload(user) {
  return {
    id: user._id,
    name: user.name,
    loginId: user.loginId,
    role: "ROOT_ADMIN",
    accountType: "ROOT_ADMIN",
  };
}
