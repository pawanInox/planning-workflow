import { Router, type NextFunction, type Request, type Response } from 'express'
import type { makeAuthController } from '../../controllers/auth.controller.ts'
import { validate } from '../../middlewares/validate.ts'
import { requireUser } from '../../middlewares/require-user.ts'
import { createTokenSchema } from '../../schemas/auth.schema.ts'
import { assertSessionAuth } from '../../services/auth/auth.service.ts'

const sessionOnly = (req: Request, _res: Response, next: NextFunction) => {
  try { assertSessionAuth(req.authVia); next() } catch (e) { next(e) }
}

export function authRoutes(controller: ReturnType<typeof makeAuthController>): Router {
  const r = Router()
  r.get('/google', controller.start)
  r.get('/google/callback', controller.callback)
  r.get('/me', controller.me)
  r.post('/logout', controller.logout)
  // who may call these is checked BEFORE the body is validated: a token gets 403 and a signed-out
  // caller 401, never a 400 about a body they were never allowed to send
  r.get('/tokens', requireUser, sessionOnly, controller.listTokens)
  r.post('/tokens', requireUser, sessionOnly, validate(createTokenSchema), controller.createToken)
  r.delete('/tokens/:id', requireUser, sessionOnly, controller.revokeToken)
  return r
}
