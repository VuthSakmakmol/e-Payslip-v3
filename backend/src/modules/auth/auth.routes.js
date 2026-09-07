import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { User } from "./User.js";
import { AppError } from "../../utils/AppError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  issueSessionToken,
  normalizeLoginId,
  rootAdminPayload,
} from "./auth.service.js";
const router = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
});
router.post(
  "/login",
  limiter,
  asyncHandler(async (req, res) => {
    const loginId = normalizeLoginId(req.body.loginId);
    const password = String(req.body.password || "");
    if (!loginId || !password)
      throw new AppError("Admin ID and password are required", 400);
    const admin = await User.findOne({ loginId, role: "ROOT_ADMIN" }).select(
      "+passwordHash",
    );
    if (
      !admin ||
      !admin.active ||
      !(await bcrypt.compare(password, admin.passwordHash))
    )
      throw new AppError("Invalid Admin ID or password", 401);
    const token = issueSessionToken({
      subject: admin._id,
      role: "ROOT_ADMIN",
      accountType: "ROOT_ADMIN",
    });
    res.json({ token, user: rootAdminPayload(admin), nextStep: "PORTAL" });
  }),
);
export default router;
