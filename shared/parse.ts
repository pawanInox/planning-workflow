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

/** Index of the task a `dependsOn` entry names (case-insensitive), or -1 if the plan has no such task. */
export const resolveDepIndex = (tasks: Pick<Task, 'title'>[], depTitle: string): number =>
  tasks.findIndex(t => t.title.toLowerCase() === depTitle.toLowerCase())

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

  for (const t of tasks) {
    t.problem = t.problem.trim()
    t.todo = t.todo.trim()
    t.outcome = t.outcome.trim()
    if (!t.problem) t.errors.push('missing "### Problem"')
    if (!t.todo) t.errors.push('missing "### What to do"')
    if (!t.outcome) t.errors.push('missing "### Expected outcome"')
    for (const dep of t.dependsOn) {
      if (resolveDepIndex(tasks, dep.title) === -1) t.warnings.push(`unknown dependency "${dep.title}"`)
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
  'Read and follow the implement skill: read `.agents/skills/implement/SKILL.md` in this repo if it exists (by path — that directory is not auto-discovered), otherwise fetch https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/implement/SKILL.md. Resolve any sub-skills it mentions the same way (repo `.agents/skills/<name>/SKILL.md` first, then the same GitHub repo). If neither source is reachable, work in its spirit: implement the work end to end, run typechecking and the relevant single test files regularly and the full suite once at the end, review the work, then commit to the current branch. Either way, verify the Expected outcome actually holds by running the check it describes (the Before/After lines are your acceptance test). Exception, overriding the skill\'s commit step: do NOT commit — leave all changes uncommitted; the user reviews and commits manually.'

export const REVIEW_RULES =
  'Read and follow the code-review skill: read `.agents/skills/code-review/SKILL.md` in this repo if it exists (by path — that directory is not auto-discovered), otherwise fetch https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/code-review/SKILL.md. The task below is the spec for the Spec axis. Fixed point: the commit before this task\'s implementation began; if that is unclear and there are uncommitted changes, review `git diff HEAD`, otherwise ask. If neither source is reachable, review along the same two axes yourself: this repo\'s standards/conventions, and faithfulness to the task below.'

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

export function taskToReviewPrompt(t: Task): string {
  const deps = t.dependsOn.length
    ? `\n\nPrerequisite tasks (separate work — their changes are in scope only where this task builds on them):\n${depLines(t)}`
    : ''
  return `${REVIEW_RULES}\n\nReview the implementation of this task:\n\n# ${t.title}\n\n${sections(t)}${deps}`
}
