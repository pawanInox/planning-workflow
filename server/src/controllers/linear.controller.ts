import type { Task } from '../../../shared/parse.ts'
import type { LinearService } from '../services/linear/linear.service.ts'
import { asyncHandler, ok } from './respond.ts'

export function makeLinearController(service: LinearService) {
  return {
    listTeams: asyncHandler(async (_req, res) => {
      ok(res, 'teams listed', await service.listTeams())
    }),

    createIssues: asyncHandler(async (req, res) => {
      const { teamId, tasks } = req.body as { teamId: string; tasks: Task[] }
      ok(res, 'issues created', await service.createIssues(teamId, tasks), 201)
    }),
  }
}
