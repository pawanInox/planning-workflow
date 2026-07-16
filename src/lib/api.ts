import type { Dep } from '../../shared/parse'

export type ProjectSummary = { id: string; title: string; taskCount: number; doneCount: number; updatedAt: string }
export type SavedTask = {
  id: string; title: string; problem: string; todo: string; outcome: string
  dependsOn: Dep[]; done: boolean; diagramNodes?: string[]
}
export type ProjectWithTasks = { id: string; title: string; diagram?: string; sequenceDiagram?: string; tasks: SavedTask[] }
export type TaskPayload = Omit<SavedTask, 'id'>
export type Team = { id: string; name: string; key: string }
export type CreatedIssue = { title: string; url: string }
export type Meme = { url: string; pageUrl: string; title: string }

const BASE = '/api/v1'

// server responses use the envelope { status: 'ok'|'error', message, data }
async function unwrap<T>(r: Response): Promise<T> {
  const body = await r.json()
  if (!r.ok || body.status === 'error') throw new Error(body.message ?? `request failed (${r.status})`)
  return body.data as T
}

const send = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ponytail: plain fetch wrappers — swap for React Query/SWR if caching/retries ever matter
export const api = {
  listProjects: (): Promise<ProjectSummary[]> =>
    fetch(`${BASE}/projects`).then(r => unwrap<ProjectSummary[]>(r)).catch(() => []),

  getProject: (id: string): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects/${id}`).then(r => unwrap<ProjectWithTasks>(r)),

  createProject: (title: string, tasks: TaskPayload[], diagram?: string): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects`, send('POST', { title, tasks, ...(diagram ? { diagram } : {}) })).then(r => unwrap<ProjectWithTasks>(r)),

  updateProject: (id: string, title: string, tasks: TaskPayload[], diagram?: string): Promise<ProjectWithTasks> =>
    fetch(`${BASE}/projects/${id}`, send('PUT', { title, tasks, ...(diagram ? { diagram } : {}) })).then(r => unwrap<ProjectWithTasks>(r)),

  deleteProject: (id: string): Promise<void> =>
    fetch(`${BASE}/projects/${id}`, { method: 'DELETE' }).then(r => unwrap<void>(r)),

  setTaskDone: (projectId: string, taskId: string, done: boolean): Promise<Response> =>
    fetch(`${BASE}/projects/${projectId}/tasks/${taskId}`, send('PATCH', { done })),

  getMeme: (query: string): Promise<Meme> =>
    fetch(`${BASE}/memes?q=${encodeURIComponent(query)}`).then(r => unwrap<Meme>(r)),

  listTeams: (): Promise<Team[]> =>
    fetch(`${BASE}/teams`).then(r => unwrap<Team[]>(r)),

  createIssues: (teamId: string, tasks: unknown[]): Promise<{ created: CreatedIssue[]; relationErrors?: string[] }> =>
    fetch(`${BASE}/issues`, send('POST', { teamId, tasks })).then(r => unwrap(r)),
}
