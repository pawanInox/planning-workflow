import type { NewTask, ProjectRepository, ProjectSummary, ProjectWithTasks, TaskEntity, TaskRepository } from '../../repositories/ports.ts'

export type ProjectsPage = {
  items: ProjectSummary[]
  page: number
  limit: number
  total: number
  totalPages: number
}
import { NotFoundError } from '../errors.ts'

/** Input shape is validated by `schemas/projects.schema.ts` at the route; this layer holds business rules only. */
export interface ProjectsService {
  createProject(data: { title: string; tasks: NewTask[]; diagram?: string; sequenceDiagram?: string }): Promise<ProjectWithTasks>
  listProjects(paging: { page: number; limit: number }): Promise<ProjectsPage>
  getProject(id: string): Promise<ProjectWithTasks>
  updateProject(id: string, data: { title?: string; tasks?: NewTask[]; diagram?: string; sequenceDiagram?: string }): Promise<ProjectWithTasks>
  deleteProject(id: string): Promise<void>
  addTask(projectId: string, task: NewTask): Promise<TaskEntity>
  updateTask(projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity>
  removeTask(projectId: string, taskId: string): Promise<void>
}

export function makeProjectsService({ projects, tasks }: { projects: ProjectRepository; tasks: TaskRepository }): ProjectsService {
  return {
    createProject: data => projects.create(data),

    async listProjects({ page, limit }) {
      const { items, total } = await projects.list({ page, limit })
      // at least 1 so an empty collection still reads as "page 1 of 1" rather than "of 0"
      return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    },

    async getProject(id) {
      const p = await projects.getById(id)
      if (!p) throw new NotFoundError(`no project "${id}"`)
      return p
    },

    async updateProject(id, data) {
      const p = await projects.update(id, data)
      if (!p) throw new NotFoundError(`no project "${id}"`)
      return p
    },

    async deleteProject(id) {
      if (!(await projects.delete(id))) throw new NotFoundError(`no project "${id}"`)
    },

    async addTask(projectId, task) {
      const created = await tasks.addTask(projectId, task)
      if (!created) throw new NotFoundError(`no project "${projectId}"`)
      return created
    },

    async updateTask(projectId, taskId, patch) {
      const updated = await tasks.updateTask(projectId, taskId, patch)
      if (!updated) throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      return updated
    },

    async removeTask(projectId, taskId) {
      if (!(await tasks.removeTask(projectId, taskId))) {
        throw new NotFoundError(`no task "${taskId}" in project "${projectId}"`)
      }
    },
  }
}
