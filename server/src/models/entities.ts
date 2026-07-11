import type { Dep } from '../../../shared/parse.ts'

export type TaskEntity = {
  id: string
  projectId: string
  order: number
  title: string
  problem: string
  todo: string
  outcome: string
  dependsOn: Dep[]
  done: boolean
}

export type NewTask = Omit<TaskEntity, 'id' | 'projectId' | 'order' | 'dependsOn' | 'done'> & {
  dependsOn?: Dep[]
  done?: boolean
}

export type Project = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export type ProjectWithTasks = Project & { tasks: TaskEntity[] }

export type ProjectSummary = { project: Project; taskCount: number; doneCount: number }
