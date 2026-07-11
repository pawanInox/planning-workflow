import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProjectUseCases, NotFoundError, ValidationError } from './project-use-cases.ts'
import type { NewTask, Project, ProjectRepository, TaskEntity } from '../domain/project-repository.ts'
import type { TaskRepository } from '../domain/task-repository.ts'

function fakeRepo(): { projects: ProjectRepository; tasks: TaskRepository; taskMap: Map<string, TaskEntity> } {
  let nextId = 1
  const projects = new Map<string, Project>()
  const taskMap = new Map<string, TaskEntity>()
  const id = () => String(nextId++)

  const fill = (t: NewTask, projectId: string, order: number): TaskEntity => ({
    id: id(), projectId, order,
    title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
    dependsOn: t.dependsOn ?? [], done: t.done ?? false,
  })
  const tasksOf = (projectId: string) =>
    [...taskMap.values()].filter(t => t.projectId === projectId).sort((a, b) => a.order - b.order)

  const projectsRepo: ProjectRepository = {
    async create({ title, tasks }) {
      const p: Project = { id: id(), title, createdAt: new Date(), updatedAt: new Date() }
      projects.set(p.id, p)
      tasks.forEach((t, i) => { const e = fill(t, p.id, i); taskMap.set(e.id, e) })
      return { ...p, tasks: tasksOf(p.id) }
    },
    async list() {
      return [...projects.values()].map(project => {
        const ts = tasksOf(project.id)
        return { project, taskCount: ts.length, doneCount: ts.filter(t => t.done).length }
      })
    },
    async getById(pid) {
      const p = projects.get(pid)
      return p ? { ...p, tasks: tasksOf(pid) } : null
    },
    async update(pid, { title, tasks }) {
      const p = projects.get(pid)
      if (!p) return null
      if (title !== undefined) p.title = title
      if (tasks !== undefined) {
        for (const t of tasksOf(pid)) taskMap.delete(t.id)
        tasks.forEach((t, i) => { const e = fill(t, pid, i); taskMap.set(e.id, e) })
      }
      return { ...p, tasks: tasksOf(pid) }
    },
    async delete(pid) {
      if (!projects.delete(pid)) return false
      for (const t of tasksOf(pid)) taskMap.delete(t.id)
      return true
    },
  }
  const tasksRepo: TaskRepository = {
    async addTask(pid, task) {
      if (!projects.has(pid)) return null
      const order = tasksOf(pid).length
      const e = fill(task, pid, order)
      taskMap.set(e.id, e)
      return e
    },
    async updateTask(pid, tid, patch) {
      const t = taskMap.get(tid)
      if (!t || t.projectId !== pid) return null
      Object.assign(t, patch)
      return t
    },
    async removeTask(pid, tid) {
      const t = taskMap.get(tid)
      if (!t || t.projectId !== pid) return false
      return taskMap.delete(tid)
    },
  }
  return { projects: projectsRepo, tasks: tasksRepo, taskMap }
}

const task = (over: Partial<NewTask> = {}): NewTask =>
  ({ title: 't', problem: 'p', todo: 'd', outcome: 'o', ...over })

test('createProject applies ids, order, and defaults', async () => {
  const uc = makeProjectUseCases(fakeRepo())
  const p = await uc.createProject({ title: 'P', tasks: [task({ title: 'a' }), task({ title: 'b', done: true })] })
  assert.equal(p.tasks.length, 2)
  assert.deepEqual(p.tasks.map(t => t.order), [0, 1])
  assert.ok(p.tasks.every(t => t.id))
  assert.deepEqual(p.tasks.map(t => t.done), [false, true])
  assert.deepEqual(p.tasks[0].dependsOn, [])
})

test('createProject rejects an empty todo', async () => {
  const uc = makeProjectUseCases(fakeRepo())
  await assert.rejects(
    uc.createProject({ title: 'P', tasks: [task(), task({ todo: ' ' })] }),
    ValidationError,
  )
})

test('getProject on unknown id throws NotFoundError', async () => {
  const uc = makeProjectUseCases(fakeRepo())
  await assert.rejects(uc.getProject('nope'), NotFoundError)
})

test('updateTask flips done', async () => {
  const uc = makeProjectUseCases(fakeRepo())
  const p = await uc.createProject({ title: 'P', tasks: [task()] })
  const t = await uc.updateTask(p.id, p.tasks[0].id, { done: true })
  assert.equal(t.done, true)
  assert.equal((await uc.getProject(p.id)).tasks[0].done, true)
})

test('updateTask with a task id from another project throws NotFoundError', async () => {
  const uc = makeProjectUseCases(fakeRepo())
  const a = await uc.createProject({ title: 'A', tasks: [task()] })
  const b = await uc.createProject({ title: 'B', tasks: [task()] })
  await assert.rejects(uc.updateTask(a.id, b.tasks[0].id, { done: true }), NotFoundError)
})

test('deleteProject cascades its tasks', async () => {
  const repo = fakeRepo()
  const uc = makeProjectUseCases(repo)
  const p = await uc.createProject({ title: 'P', tasks: [task(), task({ title: 'u' })] })
  await uc.deleteProject(p.id)
  assert.equal(repo.taskMap.size, 0)
  await assert.rejects(uc.getProject(p.id), NotFoundError)
})
