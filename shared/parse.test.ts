import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlan, planToMarkdown, taskToDescription } from './parse.ts'

const plan = `# Plan: onboarding revamp

intro text ignored

## Task: add welcome email
### Problem
No email after signup.
### What to do
Create template.
Trigger on signup.
### Expected outcome
Email within 1 minute.

## Task: broken task
### Problem
Only has a problem.
`

test('parses tasks and sections', () => {
  const { planTitle, tasks } = parsePlan(plan)
  assert.equal(planTitle, 'onboarding revamp')
  assert.equal(tasks.length, 2)

  const [a, b] = tasks
  assert.equal(a.title, 'add welcome email')
  assert.equal(a.problem, 'No email after signup.')
  assert.equal(a.todo, 'Create template.\nTrigger on signup.')
  assert.equal(a.outcome, 'Email within 1 minute.')
  assert.deepEqual(a.errors, [])

  assert.equal(b.title, 'broken task')
  assert.deepEqual(b.errors, ['missing "### What to do"', 'missing "### Expected outcome"'])

  assert.match(taskToDescription(a), /## Problem\nNo email after signup\./)
})

test('empty input yields no tasks', () => {
  assert.deepEqual(parsePlan('').tasks, [])
})

const depPlan = `# Plan: deps

## Task: add endpoint
### Problem
p
### What to do
t
### Expected outcome
o

## Task: wire client
### Problem
p
### What to do
t
### Expected outcome
o
### Depends on
- Add Endpoint — without the endpoint there is nothing for the client to call
- missing thing
`

test('planToMarkdown round-trips through parsePlan', () => {
  const tasks = [
    {
      title: 'with deps', problem: 'p1', todo: 'd1', outcome: 'o1',
      dependsOn: [
        { title: 'multi line', reason: 'blocks because reasons' },
        { title: 'minimal', reason: '' },
      ],
    },
    { title: 'multi line', problem: 'line one\nline two', todo: 'step 1\nstep 2', outcome: 'o2\nBefore: x\nAfter: y', dependsOn: [] },
    { title: 'minimal', problem: 'p3', todo: 'd3', outcome: 'o3', dependsOn: [] },
  ]
  const { planTitle, tasks: parsed } = parsePlan(planToMarkdown('T', tasks))
  assert.equal(planTitle, 'T')
  assert.deepEqual(
    parsed.map(({ title, problem, todo, outcome, dependsOn }) => ({ title, problem, todo, outcome, dependsOn })),
    tasks,
  )
  assert.ok(parsed.every(t => t.errors.length === 0 && t.warnings.length === 0))
})

// These four all round-tripped LOSSILY before: the app re-serializes saved projects back through
// parsePlan, so anything that does not survive is real data loss out of the database.
test('a body line that looks like a task heading does not fork a phantom task', () => {
  const tasks = [
    { title: 'A', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [] },
    { title: 'B', problem: 'the format is:\n## Task: sample', todo: 'd', outcome: 'o', dependsOn: [] },
    { title: 'C', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [] },
  ]
  const parsed = parsePlan(planToMarkdown('P', tasks)).tasks
  // a 4th "sample" task here would shift every index-keyed done flag and task id after it
  assert.deepEqual(parsed.map(t => t.title), ['A', 'B', 'C'])
  assert.equal(parsed[1].problem, 'the format is:\n## Task: sample')
})

test('an unrecognised ### heading in a body is kept as prose, not dropped', () => {
  const tasks = [{ title: 'X', problem: 'p', todo: 'step 1\n### Notes\nstep 2', outcome: 'o', dependsOn: [] }]
  const parsed = parsePlan(planToMarkdown('P', tasks)).tasks[0]
  assert.equal(parsed.todo, 'step 1\n### Notes\nstep 2')
})

test('a section heading inside a body does not leak into another section', () => {
  const tasks = [{ title: 'X', problem: 'p', todo: 'd', outcome: 'o1\n### Problem\nnot a real heading', dependsOn: [] }]
  const parsed = parsePlan(planToMarkdown('P', tasks)).tasks[0]
  assert.equal(parsed.problem, 'p')
  assert.equal(parsed.outcome, 'o1\n### Problem\nnot a real heading')
})

test('a dependency title containing the reason separator survives', () => {
  const tasks = [
    { title: 'add --verbose — the long form', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [] },
    { title: 'uses it', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [{ title: 'add --verbose — the long form', reason: 'nothing to call' }] },
  ]
  const parsed = parsePlan(planToMarkdown('P', tasks)).tasks
  assert.deepEqual(parsed[1].dependsOn, [{ title: 'add --verbose — the long form', reason: 'nothing to call' }])
  // a mangled title resolves to nothing, which silently drops the blocking edge
  assert.deepEqual(parsed[1].warnings, [])
})

test('a repeated task title is warned about on both the task and its dependents', () => {
  const md = planToMarkdown('P', [
    { title: 'a', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [] },
    { title: 'a', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [] },
    { title: 'c', problem: 'p', todo: 'd', outcome: 'o', dependsOn: [{ title: 'a', reason: 'r' }] },
  ])
  const parsed = parsePlan(md).tasks
  assert.ok(parsed[0].warnings.some(w => w.includes('duplicate task title')))
  assert.ok(parsed[1].warnings.some(w => w.includes('duplicate task title')))
  assert.ok(parsed[2].warnings.some(w => w.includes('ambiguous dependency')))
})

test('parses depends on with reasons and title validation', () => {
  const { tasks } = parsePlan(depPlan)
  assert.deepEqual(tasks[0].dependsOn, [])
  assert.deepEqual(tasks[0].warnings, [])
  assert.deepEqual(tasks[1].dependsOn, [
    { title: 'Add Endpoint', reason: 'without the endpoint there is nothing for the client to call' },
    { title: 'missing thing', reason: '' },
  ])
  assert.deepEqual(tasks[1].warnings, ['unknown dependency "missing thing"'])
  assert.deepEqual(tasks[1].errors, [])
})
