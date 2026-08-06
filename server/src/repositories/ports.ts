import type { NewProject, NewTask, Project, ProjectPatch, ProjectSummary, ProjectWithTasks, Spec, TaskEntity } from '../models/entities.ts'

export interface ProjectRepository {
  create(data: NewProject): Promise<ProjectWithTasks>
  /** One page, newest first, plus the overall count so callers can compute page numbers. */
  list(paging: { page: number; limit: number }): Promise<{ items: ProjectSummary[]; total: number }>
  getById(id: string): Promise<ProjectWithTasks | null>
  /** A `tasks` value replaces all of the project's tasks; every other field merges on its own. */
  update(id: string, data: ProjectPatch): Promise<ProjectWithTasks | null>
  /** Cascades the project's tasks. */
  delete(id: string): Promise<boolean>
}

export interface TaskRepository {
  /** Appends with the next `order`. Null when the project doesn't exist. */
  addTask(projectId: string, task: NewTask): Promise<TaskEntity | null>
  /** Null when the task doesn't exist or belongs to another project. */
  updateTask(projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity | null>
  removeTask(projectId: string, taskId: string): Promise<boolean>
}

export type { NewProject, NewTask, Project, ProjectPatch, ProjectSummary, ProjectWithTasks, Spec, TaskEntity }
