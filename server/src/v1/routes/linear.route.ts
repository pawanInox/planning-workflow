import { Router } from 'express'
import type { makeLinearController } from '../../controllers/linear.controller.ts'
import { validate } from '../../middlewares/validate.ts'
import { createIssuesSchema } from '../../schemas/linear.schema.ts'

export function linearRoutes(controller: ReturnType<typeof makeLinearController>): Router {
  const r = Router()
  r.get('/teams', controller.listTeams)
  r.post('/issues', validate(createIssuesSchema), controller.createIssues)
  return r
}
