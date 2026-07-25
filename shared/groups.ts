import { resolveDepIndex, type Task } from './parse.ts'

/**
 * Split tasks into independent tracks — the connected components of the
 * dependency graph, treated as UNDIRECTED.
 *
 * Components, not chains walked from roots, are what guarantee that no group
 * depends on a task in another group: when one task depends on two others, it
 * pulls both of their chains into a single group instead of appearing twice.
 *
 * Returns task indices rather than tasks so callers keep using the index-keyed
 * state they already have (the `done` set, `taskNodes`, the "Task N" labels).
 * Each group is ascending; groups come back ordered by their lowest member,
 * i.e. plan/execution order.
 */
export function groupTasks(tasks: Pick<Task, 'title' | 'dependsOn'>[]): number[][] {
  const neighbours: number[][] = tasks.map(() => [])
  tasks.forEach((task, i) => {
    for (const dep of task.dependsOn) {
      const target = resolveDepIndex(tasks, dep.title)
      // a dependency naming no task in this plan (parse.ts already warns about
      // those) has nothing to link to
      if (target === -1) continue
      neighbours[i].push(target)
      neighbours[target].push(i)
    }
  })

  const groups: number[][] = []
  const seen = new Set<number>()
  for (let start = 0; start < tasks.length; start++) {
    if (seen.has(start)) continue
    // flood-fill the component reachable from `start` in either direction
    const group: number[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const i = stack.pop()!
      group.push(i)
      for (const n of neighbours[i]) {
        if (seen.has(n)) continue
        seen.add(n)
        stack.push(n)
      }
    }
    groups.push(group.sort((a, b) => a - b))
  }
  // every index below `start` is already seen, so each new component's lowest
  // member is its `start` — the groups are in plan order without a second sort
  return groups
}
