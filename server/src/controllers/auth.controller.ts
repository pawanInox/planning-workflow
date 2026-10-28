import type { Request, Response } from 'express'
import type { AuthService } from '../services/auth/auth.service.ts'
import { SESSION_MS, safeReturnTo } from '../services/auth/auth.service.ts'
import { BadRequestError, ServiceUnavailableError, UnauthorizedError } from '../services/errors.ts'
import { cookieOptions, readCookie, SESSION_COOKIE, STATE_COOKIE } from '../utils/cookies.ts'
import { asyncHandler, ok } from './respond.ts'

const STATE_MINUTES = 10

/**
 * Sign-in is full-page navigation, so a failure must land back on the sign-in screen — never a raw
 * JSON page — and keep where the user was going, with `authError` telling the screen what to say.
 */
export const signInFailed = (returnTo: unknown, code: string) => {
  const url = new URL(safeReturnTo(returnTo), 'http://x')
  url.searchParams.set('authError', code)
  return url.pathname + url.search
}

const actorOf = (req: Request) => {
  if (!req.user) throw new UnauthorizedError('sign in to continue')
  return req.user
}

export function makeAuthController(auth: AuthService, { publicUrl }: { publicUrl: string }) {
  const bail = (res: Response, returnTo: unknown, code: string) => {
    res.clearCookie(STATE_COOKIE, { path: '/' })
    res.redirect(302, signInFailed(returnTo, code))
  }

  return {
    // state and returnTo ride in one short-lived httpOnly cookie across the Google round-trip
    start: asyncHandler(async (req, res) => {
      let started: ReturnType<AuthService['startLogin']>
      try { started = auth.startLogin(req.query.returnTo) } catch (e) {
        if (e instanceof ServiceUnavailableError) return bail(res, req.query.returnTo, 'unconfigured')
        throw e
      }
      const { url, state, returnTo } = started
      res.cookie(STATE_COOKIE, JSON.stringify({ state, returnTo }), cookieOptions(publicUrl, STATE_MINUTES * 60_000))
      res.redirect(302, url)
    }),

    callback: asyncHandler(async (req, res) => {
      let saved: { state?: string; returnTo?: string } = {}
      try { saved = JSON.parse(readCookie(req, STATE_COOKIE) ?? '{}') } catch { /* tampered: treated as missing */ }
      const code = typeof req.query.code === 'string' ? req.query.code : ''
      if (req.query.error || !code) return bail(res, saved.returnTo, 'cancelled')
      let sessionToken: string
      try {
        ({ sessionToken } = await auth.finishLogin({
          code, state: typeof req.query.state === 'string' ? req.query.state : '', expectedState: saved.state,
        }))
      } catch (e) {
        if (e instanceof ServiceUnavailableError) return bail(res, saved.returnTo, 'unconfigured')
        // state mismatch, or Google refusing the code (invalid_grant: reused or expired)
        if (!(e instanceof BadRequestError)) console.error('google sign-in failed:', (e as Error)?.message ?? e)
        return bail(res, saved.returnTo, 'failed')
      }
      res.clearCookie(STATE_COOKIE, { path: '/' })
      res.cookie(SESSION_COOKIE, sessionToken, cookieOptions(publicUrl, SESSION_MS))
      res.redirect(302, safeReturnTo(saved.returnTo)) // the cookie is ours, but never redirect off-site on trust
    }),

    me: asyncHandler(async (req, res) => {
      ok(res, 'signed in', { user: actorOf(req), via: req.authVia })
    }),

    logout: asyncHandler(async (req, res) => {
      await auth.logout(readCookie(req, SESSION_COOKIE))
      res.clearCookie(SESSION_COOKIE, { path: '/' })
      ok(res, 'signed out', null)
    }),

    // requireUser + sessionOnly run first on the token routes (auth.route.ts)
    listTokens: asyncHandler(async (req, res) => {
      ok(res, 'tokens listed', await auth.listTokens(actorOf(req)))
    }),

    createToken: asyncHandler(async (req, res) => {
      ok(res, 'token created', await auth.createToken(actorOf(req), req.body.name), 201)
    }),

    revokeToken: asyncHandler(async (req, res) => {
      await auth.revokeToken(actorOf(req), req.params.id)
      ok(res, 'token revoked', null)
    }),
  }
}
