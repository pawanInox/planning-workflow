import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

type ResourceSchema = { body?: ZodType; params?: ZodType; query?: ZodType }

/** Parses (and defaults) the request against the schema before the controller runs; ZodError falls through to the error handler. */
export const validate = (schema: ResourceSchema) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body ?? {})
      if (schema.params) schema.params.parse(req.params)
      // assign back like `body` does — otherwise the coerced/defaulted values are thrown away
      if (schema.query) req.query = schema.query.parse(req.query) as Request['query']
      next()
    } catch (e) {
      next(e)
    }
  }
