import { Router, type Request, type Response } from 'express'
import { NotFoundError, ValidationError, type ProjectUseCases } from '../application/project-use-cases.ts'

export function makeProjectRouter(uc: ProjectUseCases): Router {
  const r = Router()

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res)
      } catch (e) {
        if (e instanceof ValidationError) return res.status(400).json({ error: e.message })
        if (e instanceof NotFoundError) return res.status(404).json({ error: e.message })
        console.error(e)
        res.status(500).json({ error: 'internal error' })
      }
    }

  r.post('/', wrap(async (req, res) => {
    res.status(201).json(await uc.createProject(req.body ?? {}))
  }))

  r.get('/', wrap(async (_req, res) => {
    const summaries = await uc.listProjects()
    res.json(summaries.map(s => ({
      id: s.project.id, title: s.project.title,
      taskCount: s.taskCount, doneCount: s.doneCount, updatedAt: s.project.updatedAt,
    })))
  }))

  r.get('/:id', wrap(async (req, res) => {
    res.json(await uc.getProject(req.params.id))
  }))

  r.put('/:id', wrap(async (req, res) => {
    res.json(await uc.updateProject(req.params.id, req.body ?? {}))
  }))

  r.delete('/:id', wrap(async (req, res) => {
    await uc.deleteProject(req.params.id)
    res.status(204).end()
  }))

  r.post('/:id/tasks', wrap(async (req, res) => {
    res.status(201).json(await uc.addTask(req.params.id, req.body))
  }))

  r.patch('/:id/tasks/:taskId', wrap(async (req, res) => {
    res.json(await uc.updateTask(req.params.id, req.params.taskId, req.body ?? {}))
  }))

  r.delete('/:id/tasks/:taskId', wrap(async (req, res) => {
    await uc.removeTask(req.params.id, req.params.taskId)
    res.status(204).end()
  }))

  return r
}
