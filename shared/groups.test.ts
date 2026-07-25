import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTasks } from './groups.ts'
import type { Task } from './parse.ts'

type Groupable = Pick<Task, 'title' | 'dependsOn'>

// build tasks from a `title: [dependency titles]` sketch — order is plan order
const plan = (sketch: Record<string, string[]>): Groupable[] =>
  Object.entries(sketch).map(([title, deps]) => ({
    title,
    dependsOn: deps.map(title => ({ title, reason: '' })),
  }))

// the guarantee this module exists for: no group may hold a task whose resolvable
// dependency lives in another group, and every task lands in exactly one group
function assertGroupsAreIndependent(tasks: Groupable[], groups: number[][]) {
  const groupOf = new Map<number, number>()
  groups.forEach((group, gi) => group.forEach(i => {
    assert.ok(!groupOf.has(i), `task ${i} appears in more than one group`)
    groupOf.set(i, gi)
  }))
  assert.equal(groupOf.size, tasks.length, 'every task belongs to a group')

  tasks.forEach((task, i) => {
    for (const dep of task.dependsOn) {
      const target = tasks.findIndex(t => t.title.toLowerCase() === dep.title.toLowerCase())
      if (target === -1) continue
      assert.equal(
        groupOf.get(target), groupOf.get(i),
        `"${task.title}" depends on "${tasks[target].title}", which is in a different group`,
      )
    }
  })
}

test('no group depends on a task in another group', () => {
  // two chains, a diamond, a loner and an unknown dependency all at once
  const tasks = plan({
    a: [], b: ['a'], c: ['b'],
    d: [], e: ['d'], f: ['d'], g: ['e', 'f'],
    loner: [],
    ghosted: ['does not exist'],
  })
  assertGroupsAreIndependent(tasks, groupTasks(tasks))
})

test('two independent chains produce exactly two groups', () => {
  const tasks = plan({ a: [], b: ['a'], c: ['b'], d: [], e: ['d'] })
  assert.deepEqual(groupTasks(tasks), [[0, 1, 2], [3, 4]])
})

test('an 8-task plan of two chains splits 1-3 from 4-8', () => {
  // the acceptance scenario: tasks 1-3 are one chain, tasks 4-8 another
  const tasks = plan({
    t1: [], t2: ['t1'], t3: ['t2'],
    t4: [], t5: ['t4'], t6: ['t5'], t7: ['t6'], t8: ['t7'],
  })
  assert.deepEqual(groupTasks(tasks), [[0, 1, 2], [3, 4, 5, 6, 7]])
  assertGroupsAreIndependent(tasks, groupTasks(tasks))
})

test('a fully chained plan is one group holding every index', () => {
  const tasks = plan({ a: [], b: ['a'], c: ['b'], d: ['c'] })
  assert.deepEqual(groupTasks(tasks), [[0, 1, 2, 3]])
})

test('a diamond dependency lands entirely in one group', () => {
  // d depends on both b and c, which both depend on a — chains walked from roots
  // would split b and c apart, connected components must not
  const tasks = plan({ a: [], b: ['a'], c: ['a'], d: ['b', 'c'] })
  assert.deepEqual(groupTasks(tasks), [[0, 1, 2, 3]])
})

test('a dependency naming no task in the plan creates no edge', () => {
  const tasks = plan({ a: [], b: ['ghost'] })
  assert.deepEqual(groupTasks(tasks), [[0], [1]])
})

test('dependency titles match case-insensitively', () => {
  const tasks = plan({ 'Add User Model': [], 'create user CLI': ['add user model'] })
  assert.deepEqual(groupTasks(tasks), [[0, 1]])
})

test('groups interleaved in plan order come back ordered by lowest member', () => {
  // a depends on c, so the first group's members are not contiguous — the only
  // shape that exercises group ordering rather than plan order falling out by luck
  const tasks = plan({ a: ['c'], b: [], c: [] })
  assert.deepEqual(groupTasks(tasks), [[0, 2], [1]])
  assertGroupsAreIndependent(tasks, groupTasks(tasks))
})

test('tasks with no dependencies each become their own group', () => {
  const tasks = plan({ a: [], b: [], c: [] })
  assert.deepEqual(groupTasks(tasks), [[0], [1], [2]])
})

test('an empty task list returns no groups', () => {
  assert.deepEqual(groupTasks([]), [])
})
