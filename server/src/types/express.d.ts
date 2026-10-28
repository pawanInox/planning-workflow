import type { AuthUser } from '../models/entities.ts'

declare global {
  namespace Express {
    interface Request {
      /** set by `resolveUser` from the session cookie or a bearer token; unset when signed out */
      user?: AuthUser
      authVia?: 'session' | 'token'
    }
  }
}

export {}
