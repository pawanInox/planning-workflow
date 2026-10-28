import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { makeAuthService, safeReturnTo, type GoogleAuth } from './auth.service.ts'
import { signInFailed } from '../../controllers/auth.controller.ts'
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors.ts'
import type { ApiTokenRepository, SessionRepository, User, UserRepository } from '../../repositories/ports.ts'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function fakes() {
  let nextId = 1
  const users = new Map<string, User>()
  const sessions = new Map<string, { userId: string; expiresAt: Date }>()
  const tokens = new Map<string, { id: string; userId: string; name: string; tokenHash: string; last4: string; createdAt: Date; lastUsedAt: Date | null }>()

  const userRepo: UserRepository = {
    async upsertByGoogleSub(p) {
      const existing = [...users.values()].find(u => u.googleSub === p.googleSub)
      const u: User = { ...(existing ?? { id: String(nextId++) }), ...p }
      users.set(u.id, u)
      return u
    },
    async getById(id) { return users.get(id) ?? null },
  }
  const sessionRepo: SessionRepository = {
    async create({ userId, tokenHash, expiresAt }) { sessions.set(tokenHash, { userId, expiresAt }) },
    async findValid(tokenHash, now) {
      const s = sessions.get(tokenHash)
      return s && s.expiresAt > now ? { userId: s.userId } : null
    },
    async delete(tokenHash) { sessions.delete(tokenHash) },
  }
  const tokenRepo: ApiTokenRepository = {
    async create(t) {
      const row = { id: String(nextId++), ...t, createdAt: new Date(), lastUsedAt: null }
      tokens.set(row.id, row)
      return row
    },
    async listByUser(userId) { return [...tokens.values()].filter(t => t.userId === userId) },
    async deleteForUser(userId, id) {
      const t = tokens.get(id)
      if (!t || t.userId !== userId) return false
      return tokens.delete(id)
    },
    async findByHash(tokenHash) { return [...tokens.values()].find(t => t.tokenHash === tokenHash) ?? null },
    async touch(id, at) { const t = tokens.get(id); if (t) t.lastUsedAt = at },
  }
  let profile = { sub: 'g-1', email: 'pawan@inox.co.th', name: 'Pawan', picture: 'https://pic/1' }
  const google: GoogleAuth = {
    authUrl: state => `https://accounts.example/auth?state=${state}`,
    async exchangeCode(code) {
      if (code !== 'good-code') throw new Error('bad code')
      return profile
    },
  }
  let now = new Date('2026-10-28T00:00:00Z')
  const svc = makeAuthService({ users: userRepo, sessions: sessionRepo, tokens: tokenRepo, google, now: () => now })
  return {
    svc, users, sessions, tokens,
    setProfile: (p: typeof profile) => { profile = p },
    advance: (ms: number) => { now = new Date(now.getTime() + ms) },
  }
}

const DAY = 24 * 60 * 60 * 1000
const signIn = async (f: ReturnType<typeof fakes>) => {
  const { state } = f.svc.startLogin('/')
  return f.svc.finishLogin({ code: 'good-code', state, expectedState: state })
}

test('safeReturnTo keeps same-origin paths and turns anything else into /', () => {
  assert.equal(safeReturnTo('/?project=abc'), '/?project=abc')
  assert.equal(safeReturnTo('/'), '/')
  for (const bad of ['https://evil.example', '//evil.example', 'abc', '', undefined, '/\\evil.example'])
    assert.equal(safeReturnTo(bad), '/', String(bad))
})

test('a failed sign-in goes back where the user was going, with the reason attached', () => {
  assert.equal(signInFailed('/?project=abc', 'cancelled'), '/?project=abc&authError=cancelled')
  assert.equal(signInFailed('/?project=abc&authError=old', 'failed'), '/?project=abc&authError=failed')
  assert.equal(signInFailed('//evil.example', 'failed'), '/?authError=failed')
})

test('startLogin returns a random state in the Google URL and the sanitised returnTo', () => {
  const f = fakes()
  const a = f.svc.startLogin('//evil.example')
  const b = f.svc.startLogin('/?project=1')
  assert.notEqual(a.state, b.state)
  assert.ok(a.url.includes(a.state))
  assert.equal(a.returnTo, '/')
  assert.equal(b.returnTo, '/?project=1')
})

test('finishLogin refuses a missing or mismatched state', async () => {
  const f = fakes()
  await assert.rejects(f.svc.finishLogin({ code: 'good-code', state: 'a', expectedState: 'b' }), BadRequestError)
  await assert.rejects(f.svc.finishLogin({ code: 'good-code', state: 'a', expectedState: undefined }), BadRequestError)
})

test('finishLogin creates the user, stores only the session hash, and the cookie value resolves', async () => {
  const f = fakes()
  const { sessionToken, user } = await signIn(f)
  assert.equal(user.email, 'pawan@inox.co.th')
  assert.ok(!f.sessions.has(sessionToken), 'raw token must never be stored')
  assert.ok(f.sessions.has(sha256(sessionToken)))
  const me = await f.svc.resolveSession(sessionToken)
  assert.deepEqual(me, { id: user.id, name: 'Pawan', email: 'pawan@inox.co.th', avatarUrl: 'https://pic/1' })
})

test('a second sign-in refreshes name and avatar instead of creating a second user', async () => {
  const f = fakes()
  const first = await signIn(f)
  f.setProfile({ sub: 'g-1', email: 'Pawan@Inox.co.th', name: 'Pawan I.', picture: 'https://pic/2' })
  const second = await signIn(f)
  assert.equal(second.user.id, first.user.id)
  assert.equal(f.users.size, 1)
  assert.equal(second.user.name, 'Pawan I.')
  assert.equal(second.user.avatarUrl, 'https://pic/2')
  assert.equal(second.user.email, 'pawan@inox.co.th') // stored lowercased
})

test('a session stops resolving after 30 days', async () => {
  const f = fakes()
  const { sessionToken } = await signIn(f)
  f.advance(29 * DAY)
  assert.ok(await f.svc.resolveSession(sessionToken))
  f.advance(2 * DAY)
  assert.equal(await f.svc.resolveSession(sessionToken), null)
})

test('logout makes the cookie value stop resolving, and is idempotent', async () => {
  const f = fakes()
  const { sessionToken } = await signIn(f)
  await f.svc.logout(sessionToken)
  assert.equal(await f.svc.resolveSession(sessionToken), null)
  await f.svc.logout(sessionToken)
  await f.svc.logout(undefined)
})

test('an unknown or empty cookie resolves to nobody', async () => {
  const f = fakes()
  assert.equal(await f.svc.resolveSession('nope'), null)
  assert.equal(await f.svc.resolveSession(undefined), null)
})

// ---------- personal API tokens ----------

test('createToken returns a ydk_ token once and stores only its hash and last 4', async () => {
  const f = fakes()
  const { user } = await signIn(f)
  const t = await f.svc.createToken(user, 'laptop claude')
  assert.match(t.token, /^ydk_[A-Za-z0-9_-]{40,}$/)
  assert.equal(t.last4, t.token.slice(-4))
  const row = [...f.tokens.values()][0]
  assert.equal(row.tokenHash, sha256(t.token))
  assert.ok(!JSON.stringify(row).includes(t.token))
  const listed = await f.svc.listTokens(user)
  assert.deepEqual(Object.keys(listed[0]).sort(), ['createdAt', 'id', 'last4', 'lastUsedAt', 'name'])
})

test('a token resolves to its owner and touches lastUsedAt at most once a minute', async () => {
  const f = fakes()
  const { user } = await signIn(f)
  const { token } = await f.svc.createToken(user, 'cli')
  assert.equal((await f.svc.resolveToken(token))?.id, user.id)
  const first = [...f.tokens.values()][0].lastUsedAt
  assert.ok(first)
  f.advance(30_000)
  await f.svc.resolveToken(token)
  assert.equal([...f.tokens.values()][0].lastUsedAt, first, 'no write within the minute')
  f.advance(31_000)
  await f.svc.resolveToken(token)
  assert.notEqual([...f.tokens.values()][0].lastUsedAt, first)
})

test('a revoked token stops resolving; revoking someone else\'s token is NotFound', async () => {
  const f = fakes()
  const { user } = await signIn(f)
  f.setProfile({ sub: 'g-2', email: 'nok@example.com', name: 'Nok', picture: '' })
  const nok = (await signIn(f)).user
  const t = await f.svc.createToken(user, 'cli')
  await assert.rejects(f.svc.revokeToken(nok, t.id), NotFoundError)
  assert.ok(await f.svc.resolveToken(t.token))
  await f.svc.revokeToken(user, t.id)
  assert.equal(await f.svc.resolveToken(t.token), null)
})

test('only ydk_ tokens are looked up; anything else is nobody', async () => {
  const f = fakes()
  assert.equal(await f.svc.resolveToken('Bearer abc'), null)
  assert.equal(await f.svc.resolveToken(''), null)
})

test('a token-authenticated caller cannot manage tokens', () => {
  const f = fakes()
  assert.throws(() => f.svc.assertSessionAuth('token'), ForbiddenError)
  f.svc.assertSessionAuth('session')
})
