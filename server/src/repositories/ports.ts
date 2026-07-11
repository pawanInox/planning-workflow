import type { NewTask, Project, ProjectSummary, ProjectWithTasks, TaskEntity } from '../models/entities.ts'

export interface ProjectRepository {
  create(data: { title: string; tasks: NewTask[] }): Promise<ProjectWithTasks>
  list(): Promise<ProjectSummary[]>
  getById(id: string): Promise<ProjectWithTasks | null>
  /** A `tasks` value replaces all of the project's tasks. */
  update(id: string, data: { title?: string; tasks?: NewTask[] }): Promise<ProjectWithTasks | null>
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

export type { NewTask, Project, ProjectSummary, ProjectWithTasks, TaskEntity }
