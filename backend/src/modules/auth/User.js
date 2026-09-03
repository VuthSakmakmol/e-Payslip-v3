import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  loginId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  // Kept only for backward compatibility with an older V3 database. It is not used for login.
  email: { type: String, default: '', lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['ROOT_ADMIN'], default: 'ROOT_ADMIN', required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true })

export const User = mongoose.model('User', userSchema)
