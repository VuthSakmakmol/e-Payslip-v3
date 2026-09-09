import mongoose from "mongoose";

const telegramProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, default: "", trim: true },
    chatId: { type: String, default: "", trim: true },
    username: { type: String, default: "", trim: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    languageCode: { type: String, default: "", trim: true },
    isBot: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    chatType: { type: String, default: "", trim: true },
    linkedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    unlinkedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastUpdateId: { type: Number, default: null },
    lastMessageId: { type: Number, default: null },
    lastMessageDate: { type: Date, default: null },

    // Preserve the complete Telegram identity/chat objects returned by polling.
    // We intentionally do NOT store the /start message text because it contains
    // the employee e-PaySlip password used during Telegram verification.
    fromSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    chatSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false, minimize: false },
);

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    staffCategory: {
      type: String,
      enum: ["LOCAL", "FOREIGNER"],
      required: true,
      index: true,
    },
    dateJoin: { type: Date, required: true, index: true },
    department: { type: String, default: "", trim: true, index: true },
    line: { type: String, default: "", trim: true, index: true },
    position: { type: String, default: "", trim: true, index: true },
    companyEmail: { type: String, default: "", lowercase: true, trim: true },
    telegramChatId: { type: String, default: "", trim: true },
    telegramProfile: { type: telegramProfileSchema, default: null },
    preferredDelivery: {
      type: String,
      enum: ["EMAIL", "TELEGRAM"],
      required: true,
      default: "EMAIL",
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Employee = mongoose.model("Employee", employeeSchema);


export async function cleanupLegacyEmployeeDateOfBirth() {
  const result = await Employee.collection.updateMany(
    { dateOfBirth: { $exists: true } },
    { $unset: { dateOfBirth: '' } },
  );
  return result.modifiedCount || 0;
}

export async function normalizeExistingEmployeeEmails() {
  const result = await Employee.collection.updateMany(
    { companyEmail: { $type: "string", $ne: "" } },
    [
      {
        $set: {
          companyEmail: {
            $toLower: {
              $trim: { input: "$companyEmail" },
            },
          },
        },
      },
    ],
  );
  return result.modifiedCount || 0;
}
