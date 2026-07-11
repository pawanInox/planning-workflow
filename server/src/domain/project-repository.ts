import type { NewTask, Project, ProjectSummary, ProjectWithTasks, TaskEntity } from './project.ts'

export interface ProjectRepository {
  create(data: { title: string; tasks: NewTask[] }): Promise<ProjectWithTasks>
  list(): Promise<ProjectSummary[]>
  getById(id: string): Promise<ProjectWithTasks | null>
  /** A `tasks` value replaces all of the project's tasks. */
  update(id: string, data: { title?: string; tasks?: NewTask[] }): Promise<ProjectWithTasks | null>
  /** Cascades the project's tasks. */
  delete(id: string): Promise<boolean>
}

export type { NewTask, Project, ProjectSummary, ProjectWithTasks, TaskEntity }
