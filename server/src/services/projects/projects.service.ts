import type { NewProject, NewTask, ProjectPatch, ProjectRepository, ProjectSummary, ProjectView, ProjectWithTasks, TaskEntity, TaskRepository, UserRepository } from '../../repositories/ports.ts'

export type ProjectsPage = {
  items: ProjectSummary[]
  page: number
  limit: number
  total: number
  totalPages: number
}
import { ForbiddenError, NotFoundError } from '../errors.ts'

/** Whoever is signed in — by session cookie or API token. */
export type Actor = { id: string }

/**
 * Input shape is validated by `schemas/projects.schema.ts` at the route; this layer holds business
 * rules only. Ownership lives here, not in the controller, so the service tests cover it: any
 * signed-in actor may read any project, but every write is the owner's alone.
 */
export interface ProjectsService {
  createProject(actor: Actor, data: NewProject): Promise<ProjectWithTasks>
  listProjects(actor: Actor, paging: { page: number; limit: number }): Promise<ProjectsPage>
  getProject(actor: Actor, id: string): Promise<ProjectView>
  updateProject(actor: Actor, id: string, data: ProjectPatch): Promise<ProjectWithTasks>
  deleteProject(actor: Actor, id: string): Promise<void>
  addTask(actor: Actor, projectId: string, task: NewTask): Promise<TaskEntity>
  updateTask(actor: Actor, projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity>
  removeTask(actor: Actor, projectId: string, taskId: string): Promise<void>
}

export function makeProjectsService({ projects, tasks, users }: {
  projects: ProjectRepository
  tasks: TaskRepository
  users: Pick<UserRepository, 'getById'>
}): ProjectsService {
  const load = async (id: string) => {
    const p = await projects.getById(id)
    if (!p) throw new NotFoundError(`no project "${id}"`)
    return p
  }

  // 404 before 403: a missing project is missing for everyone. An ownerless (legacy) project has
  // no owner to match, so it stays read-only until scripts/assign-owner.ts gives it one.
  const loadOwned = async (actor: Actor, id: string) => {
    const p = await load(id)
    if (!p.ownerId || p.ownerId !== actor.id) throw new ForbiddenError('only the owner can change this project')
    return p
  }

  return {
    // the owner is whoever is authenticated; an `ownerId` smuggled into the body never wins
    createProject: (actor, data) => projects.create({ ...data, ownerId: actor.id }),

    async listProjects(actor, { page, limit }) {
      const { items, total } = await projects.list({ ownerId: actor.id, page, limit })
      // at least 1 so an empty collection still reads as "page 1 of 1" rather than "of 0"
      return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    },

    async getProject(actor, id) {
      const p = await load(id)
      const owner = p.ownerId ? await users.getById(p.ownerId) : null
      return {
        ...p,
        // name and avatar only: a reader must never learn the owner's email from a shared link
        owner: owner && { id: owner.id, name: owner.name, avatarUrl: owner.avatarUrl },
        canEdit: !!p.ownerId && p.ownerId === actor.id,
      }
    },

    async updateProject(actor, id, data) {
      await loadOwned(actor, id)
      const p = await projects.update(id, data)
      if (!p) throw new NotFoundError(`no project "${id}"`)
      return p
    },

    async deleteProject(actor, id) {
      await loadOwned(actor, id)
      if (!(await projects.delete(id))) throw new NotFoundError(`no project "${id}"`)
    },

    async addTask(actor, projectId, task) {
      await loadOwned(actor, projectId)
      const created = await tasks.addTask(projectId, task)
      if (!created) throw new NotFoundError(`no project "${projectId}"`)
      return created
    },

    async updateTask(actor, projectId, taskId, patch) {
      await loadOwned(actor, projectId)
      const updated = await tasks.updateTask(projectId, taskId, patch)
      if (!updated) throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      return updated
    },

    async removeTask(actor, projectId, taskId) {
      await loadOwned(actor, projectId)
      if (!(await tasks.removeTask(projectId, taskId))) {
        throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      }
    },
  }
}
