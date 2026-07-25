import type { ProjectsService } from '../services/projects/projects.service.ts'
import { asyncHandler, ok } from './respond.ts'

export function makeProjectsController(service: ProjectsService) {
  return {
    create: asyncHandler(async (req, res) => {
      ok(res, 'project created', await service.createProject(req.body), 201)
    }),

    list: asyncHandler(async (req, res) => {
      // `validate` has coerced and defaulted these already
      const { page, limit } = req.query as unknown as { page: number; limit: number }
      const result = await service.listProjects({ page, limit })
      ok(res, 'projects listed', {
        ...result,
        items: result.items.map(s => ({
          id: s.project.id, title: s.project.title,
          taskCount: s.taskCount, doneCount: s.doneCount, updatedAt: s.project.updatedAt,
        })),
      })
    }),

    get: asyncHandler(async (req, res) => {
      ok(res, 'project found', await service.getProject(req.params.id))
    }),

    update: asyncHandler(async (req, res) => {
      ok(res, 'project updated', await service.updateProject(req.params.id, req.body))
    }),

    remove: asyncHandler(async (req, res) => {
      await service.deleteProject(req.params.id)
      ok(res, 'project deleted')
    }),

    addTask: asyncHandler(async (req, res) => {
      ok(res, 'task added', await service.addTask(req.params.id, req.body), 201)
    }),

    patchTask: asyncHandler(async (req, res) => {
      ok(res, 'task updated', await service.updateTask(req.params.id, req.params.taskId, req.body))
    }),

    removeTask: asyncHandler(async (req, res) => {
      await service.removeTask(req.params.id, req.params.taskId)
      ok(res, 'task deleted')
    }),
  }
}
