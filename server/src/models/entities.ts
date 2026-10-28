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
  /** ids of `project.spec` entries this task implements. */
  specRefs: string[]
}

export type NewTask = Omit<TaskEntity, 'id' | 'projectId' | 'order' | 'dependsOn' | 'done' | 'diagramNodes' | 'specRefs'> & {
  dependsOn?: Dep[]
  done?: boolean
  diagramNodes?: string[]
  specRefs?: string[]
}

/** One thing the plan specifies — a model, an endpoint, an interface. Everything but the `id` is
 *  whatever the planning skill wrote, so this layer never reads it. */
export type SpecEntry = { id: string } & Record<string, unknown>

/** Section name → its entries. Sections are OPEN: `dataModels`, `api` and `interfaces` are the
 *  typical ones, not a closed list. Entry ids are unique across the whole spec — a task's
 *  `specRefs` name them bare. */
export type Spec = Record<string, SpecEntry[]>

export type Project = {
  id: string
  title: string
  /** the users id of the account that owns it; absent on projects saved before sign-in existed */
  ownerId?: string
  /** Mermaid source of the project's architecture flowchart, generated at planning time. */
  diagram?: string
  /** Mermaid source of the project's sequence diagram (participant ids match `diagram`'s node ids). */
  sequenceDiagram?: string
  /** The plan's models, endpoints and interfaces, generated at planning time like the diagrams. */
  spec?: Spec
  createdAt: Date
  updatedAt: Date
}

export type ProjectWithTasks = Project & { tasks: TaskEntity[] }

/** What a reader gets back: the project plus who owns it (never their email) and whether the caller may change it. */
export type ProjectView = ProjectWithTasks & { owner: Pick<User, 'id' | 'name' | 'avatarUrl'> | null; canEdit: boolean }

/** What it takes to create a project. Spelled out once — repository, service and every fake of
 *  them share it, so adding a project field is one edit rather than six. */
export type NewProject = { title: string; tasks: NewTask[]; diagram?: string; sequenceDiagram?: string; spec?: Spec; ownerId?: string }

/** An update: every field optional and merged on its own, EXCEPT `tasks`, which replaces the lot. */
export type ProjectPatch = Partial<Omit<NewProject, 'ownerId'>>

export type ProjectSummary = { project: Project; taskCount: number; doneCount: number }

/** A Google account that has signed in. `googleSub` is the identity key; the email can change. */
export type User = { id: string; googleSub: string; email: string; name: string; avatarUrl: string | null }

/** What a request knows about its caller — never the googleSub. */
export type AuthUser = Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>

/** A personal API token as stored: only the hash and the last 4 characters of the raw value. */
export type ApiTokenRow = { id: string; userId: string; name: string; tokenHash: string; last4: string; createdAt: Date; lastUsedAt: Date | null }
