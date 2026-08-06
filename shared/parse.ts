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

/**
 * EVERY task a `dependsOn` entry could name. Normally one, but a plan may repeat a title, and
 * then the dependency is genuinely ambiguous — callers that reason about blocking (the review
 * tree) must treat all of them as prerequisites, or a task can be worked before something it
 * waits on. `parsePlan` warns about the duplicate so the plan can be fixed.
 */
export const resolveDepIndexes = (tasks: Pick<Task, 'title'>[], depTitle: string): number[] =>
  tasks.flatMap((t, i) => (t.title.toLowerCase() === depTitle.toLowerCase() ? [i] : []))

const DEP_SEPARATOR = /\s+—\s+|\s+--\s+/
const DEP_SEPARATOR_LEADING = /^(?:\s+—\s+|\s+--\s+)/

/**
 * A dependency line is `<task title> — <reason>`, but a TITLE may itself contain the separator,
 * and splitting on the first one then silently renames the dependency so it resolves to no task —
 * dropping the blocking edge from both the review tree and Linear.
 *
 * So match the longest real task title the line starts with, and treat only what follows as the
 * reason. Falls back to the naive split when the line names no task in this plan (the parser
 * reports that as an unknown dependency anyway).
 */
function parseDepLine(raw: string, titles: string[]): Dep {
  const lower = raw.toLowerCase()
  let best = ''
  for (const title of titles) {
    if (title.length <= best.length) continue
    const t = title.toLowerCase()
    // either the line is exactly the title, or the title is followed by the separator
    if (lower === t || (lower.startsWith(t) && DEP_SEPARATOR_LEADING.test(raw.slice(title.length)))) {
      best = title
    }
  }
  if (best) return {
    title: raw.slice(0, best.length).trim(),
    reason: raw.slice(best.length).replace(DEP_SEPARATOR_LEADING, '').trim(),
  }
  const [title, ...rest] = raw.split(DEP_SEPARATOR)
  return { title: title.trim(), reason: rest.join(' ').trim() }
}

// A body line that starts with `#` would be read back as structure, forking a phantom task or
// truncating the section. One leading space demotes it to prose (headings are matched at column
// 0), and the parser strips that space again — so the round trip is lossless.
const escapeBody = (text: string) =>
  text.split('\n').map(l => (l.startsWith('#') ? ` ${l}` : l)).join('\n')
const unescapeBody = (line: string) => line.replace(/^ (?=#)/, '')

const SECTIONS: Record<string, 'problem' | 'todo' | 'outcome' | 'deps'> = {
  'problem': 'problem',
  'what to do': 'todo',
  'expected outcome': 'outcome',
  'depends on': 'deps',
}

export function parsePlan(md: string): { planTitle: string; tasks: Task[] } {
  let planTitle = ''
  const tasks: Task[] = []
  const rawDeps = new Map<Task, string[]>()
  let current: Task | null = null
  let section: 'problem' | 'todo' | 'outcome' | 'deps' | null = null

  for (const line of md.split('\n')) {
    const plan = line.match(/^#\s+Plan:\s*(.+)/i)
    if (plan) { planTitle = plan[1].trim(); continue }

    const task = line.match(/^##\s+Task:\s*(.+)/i)
    if (task) {
      current = { title: task[1].trim(), problem: '', todo: '', outcome: '', dependsOn: [], errors: [], warnings: [] }
      tasks.push(current)
      rawDeps.set(current, [])
      section = null
      continue
    }

    const heading = line.match(/^###\s+(.+)/)
    if (heading && current) {
      const next = SECTIONS[heading[1].trim().toLowerCase()]
      if (next) { section = next; continue }
      // an unrecognised ### heading is prose, not structure — fall through and keep it, rather
      // than closing the section and silently discarding the rest of the body
    }

    if (current && section === 'deps') {
      const raw = line.replace(/^-\s*/, '').trim()
      // titles are not all known yet, so keep the raw line and resolve it in the pass below
      if (raw) rawDeps.get(current)!.push(raw)
    } else if (current && section && section !== 'deps') {
      current[section] += (current[section] ? '\n' : '') + unescapeBody(line)
    }
  }

  const titles = tasks.map(t => t.title)
  const duplicated = new Set(
    titles.map(t => t.toLowerCase()).filter((t, i, all) => all.indexOf(t) !== i)
  )

  for (const t of tasks) {
    t.problem = t.problem.trim()
    t.todo = t.todo.trim()
    t.outcome = t.outcome.trim()
    if (!t.problem) t.errors.push('missing "### Problem"')
    if (!t.todo) t.errors.push('missing "### What to do"')
    if (!t.outcome) t.errors.push('missing "### Expected outcome"')

    t.dependsOn = rawDeps.get(t)!.map(raw => parseDepLine(raw, titles))
    for (const dep of t.dependsOn) {
      if (resolveDepIndex(tasks, dep.title) === -1) t.warnings.push(`unknown dependency "${dep.title}"`)
      else if (duplicated.has(dep.title.toLowerCase())) {
        t.warnings.push(`ambiguous dependency "${dep.title}" — more than one task has that title`)
      }
    }
    // a repeated title makes every dependency on it ambiguous, and makes "blocked by" unresolvable
    if (duplicated.has(t.title.toLowerCase())) t.warnings.push(`duplicate task title "${t.title}"`)
  }

  return { planTitle, tasks }
}

export function planToMarkdown(
  planTitle: string,
  tasks: Pick<Task, 'title' | 'problem' | 'todo' | 'outcome' | 'dependsOn'>[],
): string {
  const block = (t: (typeof tasks)[number]) => [
    `## Task: ${t.title}`,
    '### Problem', escapeBody(t.problem),
    '### What to do', escapeBody(t.todo),
    '### Expected outcome', escapeBody(t.outcome),
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

// The project spec stays IN the app: none of the three renderings below carry a `## Spec` block.
// A task's four sections are the whole contract wherever it travels — a Linear issue, an agent
// prompt, a review prompt. `specRefs` still drive the review screen (glow, dim, card chips); they
// just don't follow the task out of the app. Don't reintroduce a spec block in any of these.

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
