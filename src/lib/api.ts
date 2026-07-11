import type { Dep } from '../../shared/parse'

export type ProjectSummary = { id: string; title: string; taskCount: number; doneCount: number; updatedAt: string }
export type SavedTask = {
  id: string; title: string; problem: string; todo: string; outcome: string
  dependsOn: Dep[]; done: boolean
}
export type ProjectWithTasks = { id: string; title: string; tasks: SavedTask[] }
export type TaskPayload = Omit<SavedTask, 'id'>
export type Team = { id: string; name: string; key: string }
export type CreatedIssue = { title: string; url: string }

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json()).error ?? `request failed (${r.status})`)
  return r.json()
}

const post = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ponytail: plain fetch wrappers — swap for React Query/SWR if caching/retries ever matter
export const api = {
  listProjects: (): Promise<ProjectSummary[]> =>
    fetch('/api/projects').then(r => (r.ok ? r.json() : [])).catch(() => []),

  getProject: (id: string): Promise<ProjectWithTasks> =>
    fetch(`/api/projects/${id}`).then(r => json<ProjectWithTasks>(r)),

  createProject: (title: string, tasks: TaskPayload[]): Promise<ProjectWithTasks> =>
    fetch('/api/projects', post('POST', { title, tasks })).then(r => json<ProjectWithTasks>(r)),

  updateProject: (id: string, title: string, tasks: TaskPayload[]): Promise<ProjectWithTasks> =>
    fetch(`/api/projects/${id}`, post('PUT', { title, tasks })).then(r => json<ProjectWithTasks>(r)),

  deleteProject: async (id: string): Promise<void> => {
    const r = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error((await r.json()).error ?? `delete failed (${r.status})`)
  },

  setTaskDone: (projectId: string, taskId: string, done: boolean): Promise<Response> =>
    fetch(`/api/projects/${projectId}/tasks/${taskId}`, post('PATCH', { done })),

  listTeams: (): Promise<Team[]> =>
    fetch('/api/teams').then(r => json<Team[]>(r)),

  createIssues: (teamId: string, tasks: unknown[]): Promise<{ created: CreatedIssue[]; relationErrors?: string[] }> =>
    fetch('/api/issues', post('POST', { teamId, tasks })).then(r => json(r)),
}
