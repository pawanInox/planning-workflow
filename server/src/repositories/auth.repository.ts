import type { ApiTokenRepository, SessionRepository, UserRepository } from './ports.ts'
import { oid } from '../config/db.ts'
import { UserModel, toUser } from '../models/users/user.model.ts'
import { SessionModel } from '../models/sessions/session.model.ts'
import { ApiTokenModel, toApiToken } from '../models/api-tokens/api-token.model.ts'

// user ids only ever come from our own session and token rows, so a malformed one is a bug, not input
const userOid = (id: string) => {
  const o = oid(id)
  if (!o) throw new Error(`malformed user id "${id}"`)
  return o
}

export class MongooseUserRepository implements UserRepository {
  async upsertByGoogleSub({ googleSub, email, name, avatarUrl }: Parameters<UserRepository['upsertByGoogleSub']>[0]) {
    const d = await UserModel.findOneAndUpdate(
      { googleSub },
      { $set: { email, name, avatarUrl, lastLoginAt: new Date() } },
      { upsert: true, new: true },
    ).lean()
    return toUser(d)
  }

  async getById(id: string) {
    const _id = oid(id)
    const d = _id && await UserModel.findById(_id).lean()
    return d ? toUser(d) : null
  }
}

export class MongooseSessionRepository implements SessionRepository {
  async create({ userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: Date }) {
    await SessionModel.create({ userId: userOid(userId), tokenHash, expiresAt })
  }

  // the TTL monitor runs about once a minute, so the expiry is checked here too
  async findValid(tokenHash: string, now: Date) {
    const d = await SessionModel.findOne({ tokenHash, expiresAt: { $gt: now } }).lean()
    return d ? { userId: d.userId.toString() } : null
  }

  async delete(tokenHash: string) {
    await SessionModel.deleteOne({ tokenHash })
  }
}

export class MongooseApiTokenRepository implements ApiTokenRepository {
  async create({ userId, name, tokenHash, last4 }: { userId: string; name: string; tokenHash: string; last4: string }) {
    return toApiToken(await ApiTokenModel.create({ userId: userOid(userId), name, tokenHash, last4 }))
  }

  async listByUser(userId: string) {
    return (await ApiTokenModel.find({ userId: userOid(userId) }).sort({ createdAt: -1 }).lean()).map(toApiToken)
  }

  async deleteForUser(userId: string, id: string) {
    const _id = oid(id)
    if (!_id) return false
    return (await ApiTokenModel.deleteOne({ _id, userId: userOid(userId) })).deletedCount === 1
  }

  async findByHash(tokenHash: string) {
    const d = await ApiTokenModel.findOne({ tokenHash }).lean()
    return d ? toApiToken(d) : null
  }

  async touch(id: string, at: Date) {
    const _id = oid(id)
    if (_id) await ApiTokenModel.updateOne({ _id }, { $set: { lastUsedAt: at } })
  }
}
