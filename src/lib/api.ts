import type { Dep } from '../../shared/parse'

export type ProjectSummary = { id: string; title: string; taskCount: number; doneCount: number; updatedAt: string }
export type ProjectsPage = { items: ProjectSummary[]; page: number; limit: number; total: number; totalPages: number }
export type SavedTask = {
  id: string; title: string; problem: string; todo: string; outcome: string
  dependsOn: Dep[]; done: boolean; diagramNodes?: string[]; specRefs?: string[]
}
/** One thing the plan specifies. Only `id` is declared — the rest is whatever the planning skill
 *  wrote, so nothing here (or in SpecPanel) may key off a particular field name. */
export type SpecEntry = { id: string } & Record<string, unknown>
/** Section name → its entries. Sections are OPEN: `dataModels`, `api`, `interfaces` are typical,
 *  not a closed list. Entry ids are unique across the whole spec — a task's `specRefs` name them bare. */
export type Spec = Record<string, SpecEntry[]>
export type Owner = { id: string; name: string; avatarUrl: string | null }
export type ProjectWithTasks = {
  id: string; title: string; diagram?: string; sequenceDiagram?: string; spec?: Spec; tasks: SavedTask[]
  /** null for a project saved before sign-in existed */
  owner: Owner | null
  /** only the owner may change a project; everyone else signed in reads it */
  canEdit: boolean
}
export type AuthUser = { id: string; name: string; email: string; avatarUrl: string | null }
export type ApiToken = { id: string; name: string; last4: string; createdAt: string; lastUsedAt: string | null }
export type TaskPayload = Omit<SavedTask, 'id'>

const BASE = '/api/v1'
const PROJECTS_PER_PAGE = 10

/** Carries the HTTP status so callers can tell "signed out" (401) and "not yours" (403) apart. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

// one place hears about every 401 (a session that expired mid-review), instead of each caller
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

// server responses use the envelope { status: 'ok'|'error', message, data }
async function unwrap<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body.status === 'error') {
    if (r.status === 401) onUnauthorized()
    throw new ApiError(body.message ?? `request failed (${r.status})`, r.status)
  }
  return body.data as T
}

const send = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ponytail: plain fetch wrappers — swap for React Query/SWR if caching/retries ever matter
export const api = {
  // ---------- auth ----------

  me: (): Promise<{ user: AuthUser; via: 'session' | 'token' }> =>
    fetch(`${BASE}/auth/me`).then(r => unwrap(r)),

  logout: (): Promise<void> =>
    fetch(`${BASE}/auth/logout`, { method: 'POST' }).then(r => unwrap<void>(r)),

  /** a full-page navigation, not a fetch: Google's consent screen has to own the window */
  signInUrl: (returnTo: string) => `${BASE}/auth/google?returnTo=${encodeURIComponent(returnTo)}`,

  listTokens: (): Promise<ApiToken[]> =>
    fetch(`${BASE}/auth/tokens`).then(r => unwrap<ApiToken[]>(r)),

  /** the response is the ONLY time the raw `token` exists outside the server */
  createToken: (name: string): Promise<ApiToken & { token: string }> =>
    fetch(`${BASE}/auth/tokens`, send('POST', { name })).then(r => unwrap(r)),

  revokeToken: (id: string): Promise<void> =>
    fetch(`${BASE}/auth/tokens/${id}`, { method: 'DELETE' }).then(r => unwrap<void>(r)),

  // ---------- projects ----------

  listProjects: (page = 1, limit = PROJECTS_PER_PAGE): Promise<ProjectsPage> =>
    fetch(`${BASE}/projects?page=${page}&limit=${limit}`).then(r => unwrap<ProjectsPage>(r)),

  getProject: (id: string): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects/${id}`).then(r => unwrap<ProjectWithTasks>(r)),

  createProject: (title: string, tasks: TaskPayload[]): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects`, send('POST', { title, tasks })).then(r => unwrap<ProjectWithTasks>(r)),

  updateProject: (id: string, title: string, tasks: TaskPayload[]): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects/${id}`, send('PUT', { title, tasks })).then(r => unwrap<ProjectWithTasks>(r)),

  deleteProject: (id: string): Promise<void> =>
    fetch(`${BASE}/projects/${id}`, { method: 'DELETE' }).then(r => unwrap<void>(r)),

  // throws like every other method, so no caller has to know about HTTP status codes
  setTaskDone: (projectId: string, taskId: string, done: boolean): Promise<void> =>
    fetch(`${BASE}/projects/${projectId}/tasks/${taskId}`, send('PATCH', { done })).then(r => unwrap<void>(r)),
}
