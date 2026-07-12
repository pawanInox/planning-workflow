import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectSchema, patchTaskSchema } from './projects.schema.ts'

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

// the pitfall: a defaulted diagramNodes here would wipe stored nodes on every {done:true} patch
test('patch of done does not introduce a diagramNodes key', () => {
  assert.ok(!('diagramNodes' in patchTaskSchema.body.parse({ done: true })))
  assert.deepEqual(patchTaskSchema.body.parse({ diagramNodes: ['web'] }), { diagramNodes: ['web'] })
})
