import { Router } from 'express'
import type { makeProjectsController } from '../../controllers/projects.controller.ts'
import { validate } from '../../middlewares/validate.ts'
import { addTaskSchema, createProjectSchema, patchTaskSchema, updateProjectSchema } from '../../schemas/projects.schema.ts'

export function projectsRoutes(controller: ReturnType<typeof makeProjectsController>): Router {
  const r = Router()
  r.post('/', validate(createProjectSchema), controller.create)
  r.get('/', controller.list)
  r.get('/:id', controller.get)
  r.put('/:id', validate(updateProjectSchema), controller.update)
  r.delete('/:id', controller.remove)
  r.post('/:id/tasks', validate(addTaskSchema), controller.addTask)
  r.patch('/:id/tasks/:taskId', validate(patchTaskSchema), controller.patchTask)
  r.delete('/:id/tasks/:taskId', controller.removeTask)
  return r
}
