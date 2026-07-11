export type Dep = { title: string; reason: string }

export type Task = {
  title: string
  problem: string
  todo: string
  outcome: string
  dependsOn: Dep[]
  errors: string[]
  warnings: string[]
}

const SECTIONS: Record<string, 'problem' | 'todo' | 'outcome' | 'deps'> = {
  'problem': 'problem',
  'what to do': 'todo',
  'expected outcome': 'outcome',
  'depends on': 'deps',
}

export function parsePlan(md: string): { planTitle: string; tasks: Task[] } {
  let planTitle = ''
  const tasks: Task[] = []
  let current: Task | null = null
  let section: 'problem' | 'todo' | 'outcome' | 'deps' | null = null

  for (const line of md.split('\n')) {
    const plan = line.match(/^#\s+Plan:\s*(.+)/i)
    if (plan) { planTitle = plan[1].trim(); continue }

    const task = line.match(/^##\s+Task:\s*(.+)/i)
    if (task) {
      current = { title: task[1].trim(), problem: '', todo: '', outcome: '', dependsOn: [], errors: [], warnings: [] }
      tasks.push(current)
      section = null
      continue
    }

    const heading = line.match(/^###\s+(.+)/)
    if (heading && current) {
      section = SECTIONS[heading[1].trim().toLowerCase()] ?? null
      continue
    }

    if (current && section === 'deps') {
      const raw = line.replace(/^-\s*/, '').trim()
      if (raw) {
        const [title, ...rest] = raw.split(/\s+—\s+|\s+--\s+/)
        current.dependsOn.push({ title: title.trim(), reason: rest.join(' ').trim() })
      }
    } else if (current && section && section !== 'deps') {
      current[section] += (current[section] ? '\n' : '') + line
    }
  }

  const titles = new Set(tasks.map(t => t.title.toLowerCase()))
  for (const t of tasks) {
    t.problem = t.problem.trim()
    t.todo = t.todo.trim()
    t.outcome = t.outcome.trim()
    if (!t.problem) t.errors.push('missing "### Problem"')
    if (!t.todo) t.errors.push('missing "### What to do"')
    if (!t.outcome) t.errors.push('missing "### Expected outcome"')
    for (const dep of t.dependsOn) {
      if (!titles.has(dep.title.toLowerCase())) t.warnings.push(`unknown dependency "${dep.title}"`)
    }
  }

  return { planTitle, tasks }
}

export function planToMarkdown(
  planTitle: string,
  tasks: Pick<Task, 'title' | 'problem' | 'todo' | 'outcome' | 'dependsOn'>[],
): string {
  const block = (t: (typeof tasks)[number]) => [
    `## Task: ${t.title}`,
    '### Problem', t.problem,
    '### What to do', t.todo,
    '### Expected outcome', t.outcome,
    ...(t.dependsOn.length ? ['### Depends on', depLines(t as Task)] : []),
  ].join('\n')
  return [`# Plan: ${planTitle}`, ...tasks.map(block)].join('\n\n') + '\n'
}

export const AGENT_RULES =
  'Use the ponytail skill for this task. If it is not installed, install it first: `claude plugin marketplace add DietrichGebert/ponytail && claude plugin install ponytail@ponytail`, then invoke /ponytail. If installation is not possible in your environment, work in its spirit instead: the simplest solution that works, stdlib and already-installed dependencies first, fewest files, no speculative abstractions, shortest working diff. Before finishing: verify the Expected outcome actually holds by running the check it describes (the Before/After lines are your acceptance test), and leave one minimal runnable check behind if the logic is non-trivial.'

const depLines = (t: Task) =>
  t.dependsOn.map(d => `- ${d.title}${d.reason ? ` — ${d.reason}` : ''}`).join('\n')

const sections = (t: Task) =>
  `## Problem\n${t.problem}\n\n## What to do\n${t.todo}\n\n## Expected outcome\n${t.outcome}`

export function taskToDescription(t: Task): string {
  const deps = t.dependsOn.length ? `\n\n## Blocked by\n${depLines(t)}` : ''
  return `> 🤖 **For AI agents:** ${AGENT_RULES}\n\n${sections(t)}${deps}`
}

export function taskToPrompt(t: Task): string {
  const deps = t.dependsOn.length
    ? `\n\nPrerequisites (already done — context only, do not redo them):\n${depLines(t)}`
    : ''
  return `${AGENT_RULES}\n\nDo this task end to end:\n\n# ${t.title}\n\n${sections(t)}${deps}`
}
