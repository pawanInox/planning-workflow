import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { resolveDepIndex, taskToPrompt, taskToReviewPrompt, type Task } from '../../shared/parse'
import { Icon, type IconName } from './Icon'
import { pad } from '../lib/ui'

export function CopyButton({ icon, label, title, text, className = 'sm', iconOnly = false }: {
  icon: IconName; label: string; title: string; text: () => string; className?: string
  /** square icon button; the label becomes its accessible name */
  iconOnly?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={`btn btn-ghost ${iconOnly ? 'sq' : 'lead'} ${className}${copied ? ' copied' : ''}`}
      title={title}
      aria-label={iconOnly ? (copied ? 'Copied' : label) : undefined}
      onClick={() => {
        navigator.clipboard.writeText(text()).catch(() => { /* denied: the label still confirms the click */ })
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 2000)
      }}
    >
      {/* both icons stay mounted and cross-fade; both labels share one grid cell so the swap can
          never resize the button and reflow a wrapped row under the user's finger */}
      <span className="swap"><Icon name={icon} /><Icon name="check" /></span>
      {!iconOnly && (
        <span className="swap-label">
          <span aria-hidden={copied}>{label}</span>
          <span aria-hidden={!copied}>Copied</span>
        </span>
      )}
    </button>
  )
}

// Both agent prompts: implement (the implement skill) and review (the code-review skill). Neither
// carries the project spec — a copied prompt is the task's own sections and nothing else.
export function CopyPromptButtons({ task }: { task: Task }) {
  return (<>
    <CopyButton icon="bot" label="Copy prompt" title="Copy a ready-to-paste prompt for an AI agent to do this task" text={() => taskToPrompt(task)} />
    <CopyButton icon="review" label="Copy review" title="Copy a prompt for an AI agent to code-review this task's implementation" text={() => taskToReviewPrompt(task)} />
  </>)
}

function InlineCode({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
}

const ITEM = /^(?:\d+[.)]|[-•*])\s+(.*)$/

// Runs of list lines (numbered or bulleted) render as one numbered list; anything else is a paragraph.
function Lines({ lines }: { lines: string[] }) {
  const blocks: (string | string[])[] = []
  for (const line of lines) {
    const item = line.match(ITEM)?.[1]
    if (item === undefined) blocks.push(line)
    else if (Array.isArray(blocks.at(-1))) (blocks.at(-1) as string[]).push(item)
    else blocks.push([item])
  }
  return <>{blocks.map((b, i) => Array.isArray(b)
    ? <ol key={i} className="steps">{b.map((s, j) => <li key={j}><span><InlineCode text={s} /></span></li>)}</ol>
    : <p key={i}><InlineCode text={b} /></p>)}</>
}

const split = (text: string, keys: string[]) => {
  const found: Record<string, string> = {}
  const rest = text.split('\n').filter(l => l.trim()).filter(l => {
    const m = l.match(/^(\w+):\s*(.*)$/)
    if (m && keys.includes(m[1])) { found[m[1]] = m[2]; return false }
    return true
  })
  return { rest, found }
}

const Empty = () => <p className="faint">Not written yet</p>

// The Focus deck re-renders on every pointermove while a card is dragged; memoising on the task
// keeps the per-line parsing from repeating 60+ times a second for prose that has not changed.
export const TaskSections = memo(function TaskSections({ task }: { task: Task }) {
  const problem = split(task.problem, ['Scenario'])
  const outcome = split(task.outcome, ['Before', 'After'])
  const { Before, After } = outcome.found
  return (
    <div className="secs">
      <section className="sec">
        <h4>Problem</h4>
        {problem.rest.length ? <Lines lines={problem.rest} /> : <Empty />}
        {problem.found.Scenario && <div className="scenario"><b>Scenario</b> · <InlineCode text={problem.found.Scenario} /></div>}
      </section>
      <section className="sec">
        <h4>What to do</h4>
        {task.todo.trim() ? <Lines lines={task.todo.split('\n').filter(l => l.trim())} /> : <Empty />}
      </section>
      <section className="sec">
        <h4>Expected outcome</h4>
        {outcome.rest.length ? <Lines lines={outcome.rest} /> : !(Before || After) && <Empty />}
        {(Before || After) && (
          <div className="compare">
            <div className="b"><b>Before</b><InlineCode text={Before ?? '—'} /></div>
            <div className="a"><b>After</b><InlineCode text={After ?? '—'} /></div>
          </div>
        )}
      </section>
    </div>
  )
})

/** Dependencies, the spec entries the task implements, parser warnings, and its three sections. */
export function TaskBody({ task, tasks, done, refs = [], specIds, onJump, onSpecRef }: {
  task: Task
  tasks: Task[]
  done: Set<number>
  /** the task's `specRefs` */
  refs?: string[]
  /** every entry id in the project spec; null when the project has no spec */
  specIds: Set<string> | null
  onJump: (index: number) => void
  onSpecRef: (id: string) => void
}) {
  return (<>
    {(task.dependsOn.length > 0 || refs.length > 0) && (
      <div className="refs">
        {task.dependsOn.length > 0 && (
          <div className="ref-row">
            <span className="k">Depends on</span>
            <div className="v deps">
              {task.dependsOn.map(d => {
                const j = resolveDepIndex(tasks, d.title)
                const ok = j > -1 && done.has(j)
                return (
                  <div className="dep" key={d.title}>
                    {j > -1
                      ? <button className={`chip${ok ? ' ok' : ''}`} onClick={() => onJump(j)} title={ok ? 'Approved — go to it' : 'Go to this task'}>
                          <Icon name={ok ? 'check' : 'chev-r'} />{pad(j)} · {d.title}
                        </button>
                      : <span className="chip warn" title="No task in this plan has this title"><Icon name="alert" />{d.title}</span>}
                    {d.reason && <span className="why">{d.reason}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {refs.length > 0 && (
          <div className="ref-row">
            <span className="k">Implements</span>
            <div className="v">
              {refs.map(r => specIds?.has(r)
                ? <button key={r} className="chip code accent" onClick={() => onSpecRef(r)} title="Show in the Spec tab"><Icon name="code" />{r}</button>
                // the API accepts unknown refs on purpose, so the card is where a typo surfaces
                : <span key={r} className="chip code warn" title={`No spec entry named “${r}”`}><Icon name="alert" />{r}</span>)}
            </div>
          </div>
        )}
      </div>
    )}
    {task.errors.length > 0 && (
      <div className="callout warn" role="note">
        <Icon name="alert" />
        <span>{task.errors.join(', ')}. Incomplete tasks are not saved with the project until they are filled in.</span>
      </div>
    )}
    {task.warnings.filter(w => !/unknown dependency/.test(w)).map(w => (
      <div className="callout warn" key={w}><Icon name="alert" /><span>{w}</span></div>
    ))}
    <TaskSections task={task} />
  </>)
}

/** One List-view row: a checkbox, the title (expands the detail and points the side pane at it). */
export function TaskRow({ task, index, checked, selected, expanded, flash = false, onToggle, onOpen, children }: {
  task: Task
  index: number
  checked: boolean
  selected: boolean
  expanded: boolean
  /** just changed through the API */
  flash?: boolean
  onToggle: () => void
  onOpen: () => void
  children: ReactNode
}) {
  return (
    <div className={`trow${selected ? ' sel' : ''}${flash ? ' flash' : ''}`} data-task={index} data-done={checked}>
      <div className="row-line">
        <button className="check" role="checkbox" aria-checked={checked} onClick={onToggle} aria-label={`Approve ${task.title}`}>
          <Icon name="check" />
        </button>
        <button className="row-main" aria-expanded={expanded} onClick={onOpen}>
          <span className="n">{pad(index)}</span>
          <span className="t">{task.title}</span>
          <span className="meta hide-mobile">
            {task.errors.length > 0 && <span className="chip warn"><Icon name="alert" />incomplete</span>}
            {task.dependsOn.length > 0 && <span className="chip" title="Dependencies"><Icon name="flow" />{task.dependsOn.length}</span>}
          </span>
          <Icon name="chev-d" className="chev" />
        </button>
      </div>
      {expanded && (
        <div className="row-detail">
          <div className="tools"><CopyPromptButtons task={task} /></div>
          {children}
        </div>
      )}
    </div>
  )
}
