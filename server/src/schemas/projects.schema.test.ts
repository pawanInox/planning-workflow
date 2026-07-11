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
