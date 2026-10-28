import test from 'node:test'
import assert from 'node:assert/strict'
import { makeProjectsService } from './projects.service.ts'
import { ForbiddenError, NotFoundError } from '../errors.ts'
import type { NewTask, Project, ProjectRepository, TaskEntity, TaskRepository, User, UserRepository } from '../../repositories/ports.ts'

function fakeRepo(): { projects: ProjectRepository; tasks: TaskRepository; users: UserRepository; taskMap: Map<string, TaskEntity>; projectMap: Map<string, Project> } {
  let nextId = 1
  const projects = new Map<string, Project>()
  const taskMap = new Map<string, TaskEntity>()
  const id = () => String(nextId++)

  const fill = (t: NewTask, projectId: string, order: number): TaskEntity => ({
    id: id(), projectId, order,
    title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
    dependsOn: t.dependsOn ?? [], done: t.done ?? false, diagramNodes: t.diagramNodes ?? [],
    specRefs: t.specRefs ?? [],
  })
  const tasksOf = (projectId: string) =>
    [...taskMap.values()].filter(t => t.projectId === projectId).sort((a, b) => a.order - b.order)

  const projectsRepo: ProjectRepository = {
    async create({ title, tasks, diagram, spec, ownerId }) {
      const p: Project = {
        id: id(), title, ownerId, createdAt: new Date(), updatedAt: new Date(),
        ...(diagram !== undefined ? { diagram } : {}),
        ...(spec !== undefined ? { spec } : {}),
      }
      projects.set(p.id, p)
      tasks.forEach((t, i) => { const e = fill(t, p.id, i); taskMap.set(e.id, e) })
      return { ...p, tasks: tasksOf(p.id) }
    },
    async list({ ownerId, page, limit }) {
      const all = [...projects.values()].filter(p => p.ownerId === ownerId).map(project => {
        const ts = tasksOf(project.id)
        return { project, taskCount: ts.length, doneCount: ts.filter(t => t.done).length }
      })
      return { items: all.slice((page - 1) * limit, page * limit), total: all.length }
    },
    async getById(pid) {
      const p = projects.get(pid)
      return p ? { ...p, tasks: tasksOf(pid) } : null
    },
    async update(pid, { title, tasks, diagram, spec }) {
      const p = projects.get(pid)
      if (!p) return null
      if (title !== undefined) p.title = title
      if (diagram !== undefined) p.diagram = diagram
      if (spec !== undefined) p.spec = spec
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
  const usersRepo: UserRepository = {
    async upsertByGoogleSub() { throw new Error('unused') },
    async getById(uid) { return PEOPLE.find(u => u.id === uid) ?? null },
  }
  return { projects: projectsRepo, tasks: tasksRepo, users: usersRepo, taskMap, projectMap: projects }
}

const PEOPLE: User[] = [
  { id: 'u1', googleSub: 'g1', email: 'pawan@inox.co.th', name: 'Pawan', avatarUrl: 'https://pic/p' },
  { id: 'u2', googleSub: 'g2', email: 'nok@example.com', name: 'Nok', avatarUrl: null },
]
// the actor every pre-ownership test runs as; NOK is the other signed-in user
const A = { id: 'u1' }
const NOK = { id: 'u2' }

const task = (over: Partial<NewTask> = {}): NewTask =>
  ({ title: 't', problem: 'p', todo: 'd', outcome: 'o', ...over })

test('createProject applies ids, order, and defaults', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task({ title: 'a' }), task({ title: 'b', done: true })] })
  assert.equal(p.tasks.length, 2)
  assert.deepEqual(p.tasks.map(t => t.order), [0, 1])
  assert.ok(p.tasks.every(t => t.id))
  assert.deepEqual(p.tasks.map(t => t.done), [false, true])
  assert.deepEqual(p.tasks[0].dependsOn, [])
})

test('getProject on unknown id throws NotFoundError', async () => {
  const svc = makeProjectsService(fakeRepo())
  await assert.rejects(svc.getProject(A, 'nope'), NotFoundError)
})

test('updateTask flips done', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task()] })
  const t = await svc.updateTask(A, p.id, p.tasks[0].id, { done: true })
  assert.equal(t.done, true)
  assert.equal((await svc.getProject(A, p.id)).tasks[0].done, true)
})

test('updateTask with a task id from another project throws NotFoundError', async () => {
  const svc = makeProjectsService(fakeRepo())
  const a = await svc.createProject(A, { title: 'A', tasks: [task()] })
  const b = await svc.createProject(A, { title: 'B', tasks: [task()] })
  await assert.rejects(svc.updateTask(A, a.id, b.tasks[0].id, { done: true }), NotFoundError)
})

test('diagram and diagramNodes round-trip create → getProject', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, {
    title: 'P', diagram: 'graph TD\nweb-->api',
    tasks: [task({ diagramNodes: ['api'] }), task({ title: 'u' })],
  })
  const got = await svc.getProject(A, p.id)
  assert.equal(got.diagram, 'graph TD\nweb-->api')
  assert.deepEqual(got.tasks.map(t => t.diagramNodes), [['api'], []])
})

test('spec round-trips create → getProject, undeclared entry keys and all', async () => {
  const svc = makeProjectsService(fakeRepo())
  const spec = { dataModels: [{ id: 'projectModel', name: 'Project', fields: [{ name: 'spec', type: 'Spec?' }] }] }
  const p = await svc.createProject(A, { title: 'P', spec, tasks: [task()] })
  assert.deepEqual((await svc.getProject(A, p.id)).spec, spec)
})

// the point of a field-wise merge: Claude fixes up the spec while the user is mid-review, and the
// tasks the review screen is live-syncing (ids, done flags) must not be recreated underneath them
test('a spec-only update leaves the tasks and their ids alone', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task({ title: 'a' }), task({ title: 'b', done: true })] })
  const updated = await svc.updateProject(A, p.id, { spec: { api: [{ id: 'putProject' }] } })
  assert.deepEqual(updated.spec, { api: [{ id: 'putProject' }] })
  assert.deepEqual(updated.tasks.map(t => t.id), p.tasks.map(t => t.id))
  assert.deepEqual(updated.tasks.map(t => t.done), [false, true])
})

test('updateTask can set diagramNodes', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task()] })
  const t = await svc.updateTask(A, p.id, p.tasks[0].id, { diagramNodes: ['web', 'db'] })
  assert.deepEqual(t.diagramNodes, ['web', 'db'])
})

test('specRefs round-trip create → getProject', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, {
    title: 'P', tasks: [task({ specRefs: ['taskModel', 'patchTask'] }), task({ title: 'u' })],
  })
  const got = await svc.getProject(A, p.id)
  assert.deepEqual(got.tasks.map(t => t.specRefs), [['taskModel', 'patchTask'], []])
})

test('updateTask can set specRefs', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task()] })
  const t = await svc.updateTask(A, p.id, p.tasks[0].id, { specRefs: ['projectModel'] })
  assert.deepEqual(t.specRefs, ['projectModel'])
})

// a task and its spec are patched independently — flipping done must not touch the refs
test('a patch of done leaves existing specRefs intact', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task({ specRefs: ['projectModel'] })] })
  const t = await svc.updateTask(A, p.id, p.tasks[0].id, { done: true })
  assert.deepEqual(t.specRefs, ['projectModel'])
})

test('deleteProject cascades its tasks', async () => {
  const repo = fakeRepo()
  const svc = makeProjectsService(repo)
  const p = await svc.createProject(A, { title: 'P', tasks: [task(), task({ title: 'u' })] })
  await svc.deleteProject(A, p.id)
  assert.equal(repo.taskMap.size, 0)
  await assert.rejects(svc.getProject(A, p.id), NotFoundError)
})

test('listProjects pages the results and reports how many pages there are', async () => {
  const service = makeProjectsService(fakeRepo())
  for (const title of ['a', 'b', 'c', 'd', 'e']) {
    await service.createProject(A, { title, tasks: [{ title: 't', problem: 'p', todo: 'd', outcome: 'o' }] })
  }

  const first = await service.listProjects(A, { page: 1, limit: 2 })
  assert.equal(first.items.length, 2)
  assert.equal(first.total, 5)
  assert.equal(first.totalPages, 3) // 5 over 2 rounds UP, or the last project is unreachable
  assert.equal(first.page, 1)

  const last = await service.listProjects(A, { page: 3, limit: 2 })
  assert.equal(last.items.length, 1)

  // pages must not overlap or drop anything
  const second = await service.listProjects(A, { page: 2, limit: 2 })
  const seen = [...first.items, ...second.items, ...last.items].map(s => s.project.title)
  assert.equal(new Set(seen).size, 5)

  // past the end is empty, not an error
  assert.deepEqual((await service.listProjects(A, { page: 99, limit: 2 })).items, [])
})

test('an empty collection still reads as page 1 of 1', async () => {
  const page = await makeProjectsService(fakeRepo()).listProjects(A, { page: 1, limit: 10 })
  assert.deepEqual(page.items, [])
  assert.equal(page.total, 0)
  assert.equal(page.totalPages, 1) // "page 1 of 0" would be nonsense in the UI
})

// ---------- ownership ----------

test('createProject makes the actor the owner and ignores an ownerId in the body', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(NOK, { title: 'P', tasks: [task()], ownerId: 'u1' } as never)
  assert.equal(p.ownerId, 'u2')
})

test('listProjects returns only the actor\'s projects, with the matching total', async () => {
  const svc = makeProjectsService(fakeRepo())
  await svc.createProject(A, { title: 'mine 1', tasks: [task()] })
  await svc.createProject(NOK, { title: 'nok\'s', tasks: [task()] })
  await svc.createProject(A, { title: 'mine 2', tasks: [task()] })
  const page = await svc.listProjects(A, { page: 1, limit: 10 })
  assert.deepEqual(page.items.map(i => i.project.title).sort(), ['mine 1', 'mine 2'])
  assert.equal(page.total, 2)
})

test('anyone signed in can read a project; only the owner gets canEdit, and the owner never carries an email', async () => {
  const svc = makeProjectsService(fakeRepo())
  const p = await svc.createProject(A, { title: 'P', tasks: [task()] })
  const asOwner = await svc.getProject(A, p.id)
  const asReader = await svc.getProject(NOK, p.id)
  assert.equal(asOwner.canEdit, true)
  assert.equal(asReader.canEdit, false)
  assert.deepEqual(asReader.owner, { id: 'u1', name: 'Pawan', avatarUrl: 'https://pic/p' })
  assert.ok(!JSON.stringify(asReader).includes('inox.co.th'))
})

test('every write by a non-owner is Forbidden and changes nothing', async () => {
  const repo = fakeRepo()
  const svc = makeProjectsService(repo)
  const p = await svc.createProject(A, { title: 'P', tasks: [task({ title: 'a' })] })
  const tid = p.tasks[0].id
  await assert.rejects(svc.updateProject(NOK, p.id, { title: 'hijacked' }), ForbiddenError)
  await assert.rejects(svc.deleteProject(NOK, p.id), ForbiddenError)
  await assert.rejects(svc.addTask(NOK, p.id, task({ title: 'x' })), ForbiddenError)
  await assert.rejects(svc.updateTask(NOK, p.id, tid, { done: true }), ForbiddenError)
  await assert.rejects(svc.removeTask(NOK, p.id, tid), ForbiddenError)
  const after = await svc.getProject(A, p.id)
  assert.equal(after.title, 'P')
  assert.deepEqual(after.tasks.map(t => [t.title, t.done]), [['a', false]])
})

test('writes to a missing project are NotFound before any ownership check', async () => {
  const svc = makeProjectsService(fakeRepo())
  await assert.rejects(svc.updateProject(NOK, 'nope', { title: 'x' }), NotFoundError)
  await assert.rejects(svc.deleteProject(NOK, 'nope'), NotFoundError)
})

test('an ownerless (legacy) project is readable by anyone and writable by no one', async () => {
  const repo = fakeRepo()
  const svc = makeProjectsService(repo)
  const p = await svc.createProject(A, { title: 'old', tasks: [task()] })
  delete repo.projectMap.get(p.id)!.ownerId // as if created before ownership existed
  const view = await svc.getProject(A, p.id)
  assert.equal(view.owner, null)
  assert.equal(view.canEdit, false)
  await assert.rejects(svc.updateTask(A, p.id, p.tasks[0].id, { done: true }), ForbiddenError)
})
