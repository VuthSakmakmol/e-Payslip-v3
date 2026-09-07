import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { User } from "./User.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError("Authentication required", 401);
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active || user.role !== "ROOT_ADMIN")
    throw new AppError("Root admin account is not active", 401);
  req.user = user;
  next();
});
export function requireRootAdmin(req, res, next) {
  if (req.user?.role !== "ROOT_ADMIN")
    return next(new AppError("Root admin access required", 403));
  next();
}
