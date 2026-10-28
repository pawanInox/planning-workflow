import mongoose, { Schema } from 'mongoose'
import type { ApiTokenRow } from '../entities.ts'

// Personal API tokens for agents. Only sha256(raw) and the last 4 characters are kept.
const apiTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    last4: { type: String, required: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const ApiTokenModel = mongoose.model('ApiToken', apiTokenSchema, 'apiTokens')

export const toApiToken = (d: any): ApiTokenRow => ({
  id: d._id.toString(), userId: d.userId.toString(), name: d.name, tokenHash: d.tokenHash, last4: d.last4,
  createdAt: d.createdAt, lastUsedAt: d.lastUsedAt ?? null,
})
