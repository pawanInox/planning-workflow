import type { ApiTokenRow, AuthUser, NewProject, ProjectView, NewTask, Project, ProjectPatch, ProjectSummary, ProjectWithTasks, Spec, TaskEntity, User } from '../models/entities.ts'

export interface ProjectRepository {
  create(data: NewProject): Promise<ProjectWithTasks>
  /** One page of one owner's projects, newest first, plus that owner's count so callers can compute page numbers. */
  list(query: { ownerId: string; page: number; limit: number }): Promise<{ items: ProjectSummary[]; total: number }>
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

export interface UserRepository {
  /** Creates the user on first sign-in; later sign-ins refresh email, name and avatar. */
  upsertByGoogleSub(profile: Omit<User, 'id'>): Promise<User>
  getById(id: string): Promise<User | null>
}

export interface SessionRepository {
  create(session: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>
  /** Null when missing or expired at `now`. */
  findValid(tokenHash: string, now: Date): Promise<{ userId: string } | null>
  delete(tokenHash: string): Promise<void>
}

export interface ApiTokenRepository {
  create(token: { userId: string; name: string; tokenHash: string; last4: string }): Promise<ApiTokenRow>
  listByUser(userId: string): Promise<ApiTokenRow[]>
  /** False when the token is missing or belongs to another user. */
  deleteForUser(userId: string, id: string): Promise<boolean>
  findByHash(tokenHash: string): Promise<ApiTokenRow | null>
  touch(id: string, at: Date): Promise<void>
}

export type { ApiTokenRow, AuthUser, NewProject, ProjectView, NewTask, Project, ProjectPatch, ProjectSummary, ProjectWithTasks, Spec, TaskEntity, User }
