import type { NewTask, ProjectRepository } from '../domain/project-repository.ts'

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const isFilled = (s: unknown): s is string => typeof s === 'string' && s.trim() !== ''
const TEXT_FIELDS = ['title', 'problem', 'todo', 'outcome'] as const

function validateTask(t: any): NewTask {
  if (!t || typeof t !== 'object') throw new ValidationError('task must be an object')
  for (const f of TEXT_FIELDS) {
    if (!isFilled(t[f])) throw new ValidationError(`task "${t.title ?? '?'}" needs a non-empty ${f}`)
  }
  return {
    title: t.title,
    problem: t.problem,
    todo: t.todo,
    outcome: t.outcome,
    dependsOn: Array.isArray(t.dependsOn)
      ? t.dependsOn.map((d: any) => ({ title: String(d?.title ?? ''), reason: String(d?.reason ?? '') }))
      : [],
    done: t.done === true,
  }
}

export function makeProjectUseCases(repo: ProjectRepository) {
  return {
    async createProject(data: { title?: unknown; tasks?: unknown }) {
      if (!isFilled(data.title)) throw new ValidationError('project title must be a non-empty string')
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []).map(validateTask)
      return repo.create({ title: data.title.trim(), tasks })
    },

    listProjects: () => repo.list(),

    async getProject(id: string) {
      const p = await repo.getById(id)
      if (!p) throw new NotFoundError(`no project "${id}"`)
      return p
    },

    async updateProject(id: string, data: { title?: unknown; tasks?: unknown }) {
      const patch: { title?: string; tasks?: NewTask[] } = {}
      if (data.title !== undefined) {
        if (!isFilled(data.title)) throw new ValidationError('project title must be a non-empty string')
        patch.title = data.title.trim()
      }
      if (data.tasks !== undefined) {
        if (!Array.isArray(data.tasks)) throw new ValidationError('tasks must be an array')
        patch.tasks = data.tasks.map(validateTask)
      }
      const p = await repo.update(id, patch)
      if (!p) throw new NotFoundError(`no project "${id}"`)
      return p
    },

    async deleteProject(id: string) {
      if (!(await repo.delete(id))) throw new NotFoundError(`no project "${id}"`)
    },

    async addTask(projectId: string, task: unknown) {
      const created = await repo.addTask(projectId, validateTask(task))
      if (!created) throw new NotFoundError(`no project "${projectId}"`)
      return created
    },

    async updateTask(projectId: string, taskId: string, patch: any) {
      if (!patch || typeof patch !== 'object') throw new ValidationError('patch must be an object')
      const clean: Partial<NewTask> = {}
      for (const f of TEXT_FIELDS) {
        if (patch[f] !== undefined) {
          if (!isFilled(patch[f])) throw new ValidationError(`${f} may not be empty`)
          clean[f] = patch[f]
        }
      }
      if (patch.dependsOn !== undefined) {
        if (!Array.isArray(patch.dependsOn)) throw new ValidationError('dependsOn must be an array')
        clean.dependsOn = patch.dependsOn
      }
      if (patch.done !== undefined) {
        if (typeof patch.done !== 'boolean') throw new ValidationError('done must be a boolean')
        clean.done = patch.done
      }
      const updated = await repo.updateTask(projectId, taskId, clean)
      if (!updated) throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      return updated
    },

    async removeTask(projectId: string, taskId: string) {
      if (!(await repo.removeTask(projectId, taskId))) {
        throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      }
    },
  }
}
