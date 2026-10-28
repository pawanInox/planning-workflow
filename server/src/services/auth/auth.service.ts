import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ApiTokenRepository, ApiTokenRow, AuthUser, SessionRepository, User, UserRepository } from '../../repositories/ports.ts'
import { BadRequestError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '../errors.ts'

/** Google's side of sign-in, behind a port so tests never call Google (see `google.ts`). */
export interface GoogleAuth {
  authUrl(state: string): string
  /** Exchanges the callback `code` and returns the verified ID-token claims. */
  exchangeCode(code: string): Promise<{ sub: string; email: string; name: string; picture?: string | null }>
}

export const SESSION_DAYS = 30
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
const TOKEN_PREFIX = 'ydk_'
const TOUCH_EVERY_MS = 60_000

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const randomToken = () => randomBytes(32).toString('base64url')
const toAuthUser = ({ id, name, email, avatarUrl }: User): AuthUser => ({ id, name, email, avatarUrl })
const sameString = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Only a same-origin path survives the round-trip through Google; anything else lands on `/`. */
export const safeReturnTo = (raw: unknown): string =>
  typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/'

/** Tokens may not mint or revoke tokens, so one leaked token cannot entrench itself. */
export function assertSessionAuth(via: 'session' | 'token' | undefined) {
  if (via === 'token') throw new ForbiddenError('tokens cannot manage tokens — sign in to the app')
}

export type PublicToken = Pick<ApiTokenRow, 'id' | 'name' | 'last4' | 'createdAt' | 'lastUsedAt'>
const toPublic = ({ id, name, last4, createdAt, lastUsedAt }: ApiTokenRow): PublicToken => ({ id, name, last4, createdAt, lastUsedAt })

export type AuthService = ReturnType<typeof makeAuthService>

export function makeAuthService({ users, sessions, tokens, google, now = () => new Date() }: {
  users: UserRepository
  sessions: SessionRepository
  tokens: ApiTokenRepository
  /** null when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset — the routes answer 503 instead */
  google: GoogleAuth | null
  now?: () => Date
}) {
  const requireGoogle = () => {
    if (!google) throw new ServiceUnavailableError('Google sign-in is not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_URL')
    return google
  }

  return {
    startLogin(returnTo: unknown) {
      const state = randomToken()
      return { url: requireGoogle().authUrl(state), state, returnTo: safeReturnTo(returnTo) }
    },

    /** `expectedState` is what the browser carried in the state cookie; it must match Google's echo. */
    async finishLogin({ code, state, expectedState }: { code: string; state: string; expectedState: string | undefined }) {
      if (!state || !expectedState || !sameString(state, expectedState)) {
        throw new BadRequestError('sign-in expired or was started in another tab — please try again')
      }
      const profile = await requireGoogle().exchangeCode(code)
      const user = await users.upsertByGoogleSub({
        googleSub: profile.sub,
        email: profile.email.toLowerCase(),
        name: profile.name,
        avatarUrl: profile.picture || null,
      })
      const sessionToken = randomToken()
      await sessions.create({
        userId: user.id,
        tokenHash: sha256(sessionToken), // the raw value lives only in the browser's cookie
        expiresAt: new Date(now().getTime() + SESSION_MS),
      })
      return { sessionToken, user: toAuthUser(user) }
    },

    async resolveSession(sessionToken: string | undefined): Promise<AuthUser | null> {
      if (!sessionToken) return null
      const s = await sessions.findValid(sha256(sessionToken), now())
      const user = s && await users.getById(s.userId)
      return user ? toAuthUser(user) : null
    },

    async logout(sessionToken: string | undefined) {
      if (sessionToken) await sessions.delete(sha256(sessionToken))
    },

    // ---------- personal API tokens ----------

    /** The only time the raw token leaves the server. */
    async createToken(actor: AuthUser, name: string) {
      const token = TOKEN_PREFIX + randomToken()
      const row = await tokens.create({ userId: actor.id, name, tokenHash: sha256(token), last4: token.slice(-4) })
      return { ...toPublic(row), token }
    },

    async listTokens(actor: AuthUser) {
      return (await tokens.listByUser(actor.id)).map(toPublic)
    },

    async revokeToken(actor: AuthUser, id: string) {
      if (!(await tokens.deleteForUser(actor.id, id))) throw new NotFoundError(`no token "${id}"`)
    },

    async resolveToken(raw: string): Promise<AuthUser | null> {
      if (!raw.startsWith(TOKEN_PREFIX)) return null
      const row = await tokens.findByHash(sha256(raw))
      const user = row && await users.getById(row.userId)
      if (!row || !user) return null
      // a busy agent would otherwise write on every request; a minute is plenty for "last used"
      const at = now()
      if (!row.lastUsedAt || at.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) await tokens.touch(row.id, at)
      return toAuthUser(user)
    },

    assertSessionAuth,
  }
}
