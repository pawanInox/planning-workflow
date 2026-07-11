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
