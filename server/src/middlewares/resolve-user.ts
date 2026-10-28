import type { NextFunction, Request, Response } from 'express'
import type { AuthService } from '../services/auth/auth.service.ts'
import { readCookie, SESSION_COOKIE } from '../utils/cookies.ts'

/**
 * Works out who is asking: an `Authorization: Bearer ydk_…` token (agents) wins over the session
 * cookie (the browser). Never rejects — an unknown cookie or token just leaves `req.user` unset, and
 * the route decides whether that is allowed.
 */
export const resolveUser = (auth: Pick<AuthService, 'resolveSession' | 'resolveToken'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization?.match(/^Bearer\s+(ydk_\S+)$/)?.[1]
    const lookup = bearer
      ? auth.resolveToken(bearer).then(u => u && { user: u, via: 'token' as const })
      : auth.resolveSession(readCookie(req, SESSION_COOKIE)).then(u => u && { user: u, via: 'session' as const })
    lookup
      .then(found => {
        if (found) { req.user = found.user; req.authVia = found.via }
        next()
      })
      .catch(next)
  }
