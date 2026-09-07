import mongoose from "mongoose";

const telegramCredentialSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    passwordFingerprint: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    passwordEncrypted: { type: String, default: "", select: false },
    status: {
      type: String,
      enum: ["PENDING", "USED", "DISABLED"],
      default: "PENDING",
      index: true,
    },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const TelegramCredential = mongoose.model(
  "TelegramCredential",
  telegramCredentialSchema,
);
