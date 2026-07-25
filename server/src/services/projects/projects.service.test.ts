import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProjectsService } from './projects.service.ts'
import { NotFoundError } from '../errors.ts'
import type { NewTask, Project, ProjectRepository, TaskEntity, TaskRepository } from '../../repositories/ports.ts'

function fakeRepo(): { projects: ProjectRepository; tasks: TaskRepository; taskMap: Map<string, TaskEntity> } {
  let nextId = 1
  const projects = new Map<string, Project>()
  const taskMap = new Map<string, TaskEntity>()
  const id = () => String(nextId++)

  const fill = (t: NewTask, projectId: string, order: number): TaskEntity => ({
    id: id(), projectId, order,
    title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
    dependsOn: t.dependsOn ?? [], done: t.done ?? false, diagramNodes: t.diagramNodes ?? [],
  })
  const tasksOf = (projectId: string) =>
    [...taskMap.values()].filter(t => t.projectId === projectId).sort((a, b) => a.order - b.order)

  const projectsRepo: ProjectRepository = {
    async create({ title, tasks, diagram }) {
      const p: Project = { id: id(), title, createdAt: new Date(), updatedAt: new Date(), ...(diagram !== undefined ? { diagram } : {}) }
      projects.set(p.id, p)
      tasks.forEach((t, i) => { const e = fill(t, p.id, i); taskMap.set(e.id, e) })
      return { ...p, tasks: tasksOf(p.id) }
    },
    async list({ page, limit }) {
      const all = [...projects.values()].map(project => {
        const ts = tasksOf(project.id)
        return { project, taskCount: ts.length, doneCount: ts.filter(t => t.done).length }
      })
      return { items: all.slice((page - 1) * limit, page * limit), total: all.length }
    },
    async getById(pid) {
      const p = projects.get(pid)
      return p ? { ...p, tasks: tasksOf(pid) } : null
    },
    async update(pid, { title, tasks, diagram }) {
      const p = projects.get(pid)
      if (!p) return null
      if (title !== undefined) p.title = title
      if (diagram !== undefined) p.diagram = diagram
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
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject({ title: 'P', tasks: [task({ title: 'a' }), task({ title: 'b', done: true })] })
  assert.equal(p.tasks.length, 2)
  assert.deepEqual(p.tasks.map(t => t.order), [0, 1])
  assert.ok(p.tasks.every(t => t.id))
  assert.deepEqual(p.tasks.map(t => t.done), [false, true])
  assert.deepEqual(p.tasks[0].dependsOn, [])
})

test('getProject on unknown id throws NotFoundError', async () => {
  const svc = makeProjectsService(fakeRepo())
  await assert.rejects(svc.getProject('nope'), NotFoundError)
})

test('updateTask flips done', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject({ title: 'P', tasks: [task()] })
  const t = await svc.updateTask(p.id, p.tasks[0].id, { done: true })
  assert.equal(t.done, true)
  assert.equal((await svc.getProject(p.id)).tasks[0].done, true)
})

test('updateTask with a task id from another project throws NotFoundError', async () => {
  const svc = makeProjectsService(fakeRepo())
  const a = await svc.createProject({ title: 'A', tasks: [task()] })
  const b = await svc.createProject({ title: 'B', tasks: [task()] })
  await assert.rejects(svc.updateTask(a.id, b.tasks[0].id, { done: true }), NotFoundError)
})

test('diagram and diagramNodes round-trip create → getProject', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject({
    title: 'P', diagram: 'graph TD\nweb-->api',
    tasks: [task({ diagramNodes: ['api'] }), task({ title: 'u' })],
  })
  const got = await svc.getProject(p.id)
  assert.equal(got.diagram, 'graph TD\nweb-->api')
  assert.deepEqual(got.tasks.map(t => t.diagramNodes), [['api'], []])
})

test('updateTask can set diagramNodes', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject({ title: 'P', tasks: [task()] })
  const t = await svc.updateTask(p.id, p.tasks[0].id, { diagramNodes: ['web', 'db'] })
  assert.deepEqual(t.diagramNodes, ['web', 'db'])
})

test('deleteProject cascades its tasks', async () => {
  const repo = fakeRepo()
  const svc = makeProjectsService(repo)
  const p = await svc.createProject({ title: 'P', tasks: [task(), task({ title: 'u' })] })
  await svc.deleteProject(p.id)
  assert.equal(repo.taskMap.size, 0)
  await assert.rejects(svc.getProject(p.id), NotFoundError)
})

test('listProjects pages the results and reports how many pages there are', async () => {
  const service = makeProjectsService(fakeRepo())
  for (const title of ['a', 'b', 'c', 'd', 'e']) {
    await service.createProject({ title, tasks: [{ title: 't', problem: 'p', todo: 'd', outcome: 'o' }] })
  }

  const first = await service.listProjects({ page: 1, limit: 2 })
  assert.equal(first.items.length, 2)
  assert.equal(first.total, 5)
  assert.equal(first.totalPages, 3) // 5 over 2 rounds UP, or the last project is unreachable
  assert.equal(first.page, 1)

  const last = await service.listProjects({ page: 3, limit: 2 })
  assert.equal(last.items.length, 1)

  // pages must not overlap or drop anything
  const second = await service.listProjects({ page: 2, limit: 2 })
  const seen = [...first.items, ...second.items, ...last.items].map(s => s.project.title)
  assert.equal(new Set(seen).size, 5)

  // past the end is empty, not an error
  assert.deepEqual((await service.listProjects({ page: 99, limit: 2 })).items, [])
})

test('an empty collection still reads as page 1 of 1', async () => {
  const page = await makeProjectsService(fakeRepo()).listProjects({ page: 1, limit: 10 })
  assert.deepEqual(page.items, [])
  assert.equal(page.total, 0)
  assert.equal(page.totalPages, 1) // "page 1 of 0" would be nonsense in the UI
})
