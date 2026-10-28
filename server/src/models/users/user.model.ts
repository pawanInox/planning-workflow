import mongoose, { Schema } from 'mongoose'
import type { User } from '../entities.ts'

const userSchema = new Schema(
  {
    googleSub: { type: String, required: true, unique: true }, // the identity key — the email can change
    email: { type: String, required: true, lowercase: true, index: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

export const UserModel = mongoose.model('User', userSchema)

export const toUser = (d: any): User => ({
  id: d._id.toString(), googleSub: d.googleSub, email: d.email, name: d.name, avatarUrl: d.avatarUrl ?? null,
})
