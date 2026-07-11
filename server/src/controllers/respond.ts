import type { NextFunction, Request, Response } from 'express'

/** Standardized success envelope: { status: "ok", message, data } */
export const ok = (res: Response, message: string, data?: unknown, status = 200) =>
  res.status(status).json({ status: 'ok', message, data })

/** Routes async controller errors into the error-handler middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next)
    }
