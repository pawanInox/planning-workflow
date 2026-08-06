import test from 'node:test'
import assert from 'node:assert/strict'
import type { ZodError } from 'zod'
import { createProjectSchema, patchTaskSchema, updateProjectSchema } from './projects.schema.ts'

const task = { title: 't', problem: 'p', todo: 'd', outcome: 'o' }

test('create schema applies defaults', () => {
  const parsed = createProjectSchema.body.parse({ title: 'P', tasks: [task] })
  assert.deepEqual(parsed.tasks[0].dependsOn, [])
  assert.equal(parsed.tasks[0].done, false)
})

test('create schema rejects an empty todo', () => {
  assert.throws(() => createProjectSchema.body.parse({ title: 'P', tasks: [{ ...task, todo: ' ' }] }))
})

test('create schema rejects an empty project title', () => {
  assert.throws(() => createProjectSchema.body.parse({ title: '  ', tasks: [] }))
})

test('patch schema allows partial updates but not blanked fields', () => {
  assert.deepEqual(patchTaskSchema.body.parse({ done: true }), { done: true })
  assert.throws(() => patchTaskSchema.body.parse({ title: '' }))
  assert.throws(() => patchTaskSchema.body.parse({ done: 'yes' }))
})

test('create schema accepts diagram and diagramNodes, rejects empty ones', () => {
  const parsed = createProjectSchema.body.parse({
    title: 'P', diagram: 'graph TD\nweb-->api', tasks: [{ ...task, diagramNodes: ['api'] }],
  })
  assert.equal(parsed.diagram, 'graph TD\nweb-->api')
  assert.deepEqual(parsed.tasks[0].diagramNodes, ['api'])
  assert.deepEqual(createProjectSchema.body.parse({ title: 'P', tasks: [task] }).tasks[0].diagramNodes, [])
  assert.throws(() => createProjectSchema.body.parse({ title: 'P', tasks: [], diagram: ' ' }))
  assert.throws(() => createProjectSchema.body.parse({ title: 'P', tasks: [{ ...task, diagramNodes: [''] }] }))
})

test('create schema keeps spec entry keys it never declared', () => {
  const spec = { dataModels: [{ id: 'projectModel', name: 'Project', fields: [{ name: 'spec' }] }] }
  const parsed = createProjectSchema.body.parse({ title: 'P', tasks: [], spec })
  assert.deepEqual(parsed.spec, spec)
})

// ids are what a task's specRefs point at, so a repeat makes a ref ambiguous — and sections are
// open, so the clash is spec-wide rather than per section
test('create schema rejects a spec that repeats an entry id, naming the second one', () => {
  const parse = () => createProjectSchema.body.parse({
    title: 'P', tasks: [],
    spec: { dataModels: [{ id: 'a' }], api: [{ id: 'a' }] },
  })
  assert.throws(parse, (e: ZodError) => {
    assert.deepEqual(e.issues[0].path, ['spec', 'api', 0, 'id'])
    assert.match(e.issues[0].message, /duplicate spec entry id 'a'/)
    return true
  })
})

test('create schema rejects a spec entry with no id', () => {
  assert.throws(() => createProjectSchema.body.parse({ title: 'P', tasks: [], spec: { api: [{ method: 'GET' }] } }))
  assert.throws(() => createProjectSchema.body.parse({ title: 'P', tasks: [], spec: { api: [{ id: ' ' }] } }))
})

test('update schema takes a spec on its own', () => {
  const parsed = updateProjectSchema.body.parse({ spec: { api: [{ id: 'getProject' }] } })
  assert.deepEqual(parsed, { spec: { api: [{ id: 'getProject' }] } })
})

// the pitfall: a defaulted diagramNodes/specRefs here would wipe stored values on every {done:true} patch
test('patch of done does not introduce a diagramNodes or specRefs key', () => {
  const patched = patchTaskSchema.body.parse({ done: true })
  assert.ok(!('diagramNodes' in patched))
  assert.ok(!('specRefs' in patched))
  assert.deepEqual(patchTaskSchema.body.parse({ diagramNodes: ['web'] }), { diagramNodes: ['web'] })
  assert.deepEqual(patchTaskSchema.body.parse({ specRefs: ['projectModel'] }), { specRefs: ['projectModel'] })
})
