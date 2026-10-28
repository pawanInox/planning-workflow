import type { NextFunction, Request, Response } from 'express'
import { UnauthorizedError } from '../services/errors.ts'

/** 401 unless `resolveUser` found a session or token. */
export const requireUser = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user ? undefined : new UnauthorizedError('sign in to continue'))
