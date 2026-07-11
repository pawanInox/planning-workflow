import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { NotFoundError, ServiceUnavailableError, UpstreamError } from '../services/errors.ts'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'validation failed',
      details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  if (err instanceof NotFoundError) return res.status(404).json({ status: 'error', message: err.message })
  if (err instanceof ServiceUnavailableError) return res.status(503).json({ status: 'error', message: err.message })
  if (err instanceof UpstreamError) return res.status(502).json({ status: 'error', message: err.message })
  console.error(err)
  res.status(500).json({ status: 'error', message: 'internal error' })
}
