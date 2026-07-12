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
  /** Mermaid node ids this task touches in the project diagram. */
  diagramNodes: string[]
}

export type NewTask = Omit<TaskEntity, 'id' | 'projectId' | 'order' | 'dependsOn' | 'done' | 'diagramNodes'> & {
  dependsOn?: Dep[]
  done?: boolean
  diagramNodes?: string[]
}

export type Project = {
  id: string
  title: string
  /** Mermaid source of the project's architecture flowchart, generated at planning time. */
  diagram?: string
  createdAt: Date
  updatedAt: Date
}

export type ProjectWithTasks = Project & { tasks: TaskEntity[] }

export type ProjectSummary = { project: Project; taskCount: number; doneCount: number }
