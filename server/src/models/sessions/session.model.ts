import mongoose, { Schema } from 'mongoose'

// One row per signed-in browser. Only sha256(cookie value) is stored; the TTL index removes the row
// when it expires, and sign-out deletes it outright so a copied cookie stops working at once.
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const SessionModel = mongoose.model('Session', sessionSchema)
