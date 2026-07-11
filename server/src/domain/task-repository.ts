import type { NewTask, TaskEntity } from './project.ts'

export interface TaskRepository {
  /** Appends with the next `order`. Null when the project doesn't exist. */
  addTask(projectId: string, task: NewTask): Promise<TaskEntity | null>
  /** Null when the task doesn't exist or belongs to another project. */
  updateTask(projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity | null>
  removeTask(projectId: string, taskId: string): Promise<boolean>
}

export type { NewTask, TaskEntity }
