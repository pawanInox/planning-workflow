import { memo, useState } from 'react'
import { taskToPrompt, taskToReviewPrompt } from '../../shared/parse'
import type { Task } from '../../shared/parse'

function CopyButton({ label, title, text }: { label: string; title: string; text: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn-ghost"
      style={{ height: 28, fontSize: 12, padding: '0 10px', whiteSpace: 'nowrap' }}
      title={title}
      onClick={() => {
        navigator.clipboard.writeText(text())
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// renders both agent-prompt buttons: implement (the implement skill) and review (the code-review skill)
export function CopyPromptButton({ task }: { task: Task }) {
  return (<>
    <CopyButton label="🤖 Copy prompt" title="Copy a ready-to-paste prompt for an AI agent to do this task" text={() => taskToPrompt(task)} />
    <CopyButton label="🔍 Copy review" title="Copy a prompt for an AI agent to code-review this task's implementation" text={() => taskToReviewPrompt(task)} />
  </>)
}

export const cardHue = (index: number) => `var(--card-hue-${index % 6})`

const KINDS: [RegExp, string, string][] = [
  [/fix|bug|broken|repair/, '🔧', 'debugging'],
  [/test|spec|e2e|matrix/, '🧪', 'software testing'],
  [/email|mail/, '✉️', 'email spam'],
  [/auth|permission|security|access|membership|guard/, '🛡️', 'hacker security'],
  [/client|ui|page|component|style|design|card|color/, '🎨', 'css'],
  [/migrat|database|index|schema|backfill|term|data/, '🗄️', 'database'],
  [/deploy|release|ship|rollout|stabiliz/, '🚀', 'deploy friday'],
  [/document|write.*(spec|doc)|checklist/, '📝', 'paperwork'],
  [/api|endpoint|route|server|backend/, '🔌', 'backend'],
  [/metric|track|analytic|measure/, '📊', 'graphs'],
  [/search|find|filter/, '🔍', 'searching'],
]

function kindOf(t: Task): [string, string] {
  const hay = `${t.title} ${t.todo}`.toLowerCase()
  for (const [re, icon, meme] of KINDS) if (re.test(hay)) return [icon, meme]
  return ['🧩', 'programming']
}

export const taskIcon = (t: Task) => kindOf(t)[0]
export const taskMemeQuery = (t: Task) => kindOf(t)[1]

export const unknownDeps = (t: Task) =>
  new Set(t.warnings.map(w => (w.match(/unknown dependency "(.*)"/) || [])[1]).filter(Boolean))

export function DepChips({ task, resolved }: {
  task: Task
  resolved?: (dep: string) => { done: boolean; onClick?: () => void } | null
}) {
  const unknown = unknownDeps(task)
  const deps = task.dependsOn.filter(d => !unknown.has(d.title))
  if (deps.length === 0 && task.warnings.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {deps.map(d => {
          const r = resolved?.(d.title)
          const style: React.CSSProperties = r?.done
            ? { color: 'var(--on-lime)', background: 'var(--lime)' }
            : { color: 'var(--badge-text)', background: 'var(--badge-bg)' }
          return r?.onClick ? (
            <button key={d.title} className="pill" title={d.reason} onClick={r.onClick} style={{ ...style, border: 'none', cursor: 'pointer' }}>
              {r.done ? '✓' : '⛓'} {d.title}
            </button>
          ) : r ? (
            <span key={d.title} className="pill" title={d.reason} style={style}>
              {r.done ? '✓' : '⛓'} {d.title}
            </span>
          ) : (
            <span key={d.title} className="pill" title={d.reason} style={style}>⛓ {d.title}</span>
          )
        })}
        {task.warnings.map(w => (
          <span key={w} style={{ fontSize: 12, color: 'var(--warn)' }}>⚠ {w}</span>
        ))}
      </div>
      {deps.filter(d => d.reason).map(d => {
        const isDone = resolved?.(d.title)?.done ?? false
        return (
          <p key={d.title} style={{ fontSize: 12, color: isDone ? 'var(--text-muted)' : 'var(--warn)', margin: '6px 0 0' }}>
            {isDone ? '✓' : '🔒'} <span style={{ fontWeight: 600 }}>{d.title}:</span> {d.reason}
          </p>
        )
      })}
    </div>
  )
}

export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? <code key={i} className="inline-code">{part}</code> : part
      )}
    </>
  )
}

type Tone = 'problem' | 'action' | 'outcome'
const TONES: Record<Tone, { color: string; bg: string }> = {
  problem: { color: 'var(--sec-problem)', bg: 'var(--sec-problem-bg)' },
  action: { color: 'var(--sec-action)', bg: 'var(--sec-action-bg)' },
  outcome: { color: 'var(--sec-outcome)', bg: 'var(--sec-outcome-bg)' },
}

export function Section({ name, text, tone, large = false }: { name: string; text: string; tone: Tone; large?: boolean }) {
  const c = TONES[tone]
  // pixel chrome, crisp content: the dense task prose uses a readable humanist sans
  // (the pixel faces carry the titles/HUD/labels; this is only the reading text)
  const body = {
    fontFamily: '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: large ? 15 : 13.5,
    lineHeight: 1.65,
  }
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.color}`, borderRadius: '0 8px 8px 0', padding: '10px 14px', margin: `0 0 ${large ? 14 : 8}px` }}>
      <p style={{ fontSize: large ? 12 : 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: c.color, margin: '0 0 4px' }}>
        {name}
      </p>
      {text.split('\n').map((line, i) => {
        const kw = line.match(/^(Scenario|Before|After):\s*(.*)$/)
        if (kw) return (
          <p key={i} style={{ ...body, margin: '8px 0 0' }}>
            <span style={{ fontWeight: 600, color: c.color }}>{kw[1]}:</span> <InlineCode text={kw[2]} />
          </p>
        )
        const step = line.match(/^(\d+)[.)]\s+(.*)$/)
        if (step) return (
          <p key={i} style={{ ...body, margin: '8px 0 0', display: 'flex', gap: 8 }}>
            <span style={{
              flexShrink: 0, width: 20, height: 20, marginTop: 2, borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: c.color,
              background: `color-mix(in srgb, ${c.color} 12%, transparent)`,
            }}>
              {step[1]}
            </span>
            <span style={{ minWidth: 0 }}><InlineCode text={step[2]} /></span>
          </p>
        )
        const bullet = line.match(/^[-•*]\s+(.*)$/)
        if (bullet) return (
          <p key={i} style={{ ...body, margin: '4px 0 0', paddingLeft: 28, textIndent: -12 }}>
            <span style={{ color: c.color, fontWeight: 700 }}>•</span> <InlineCode text={bullet[1]} />
          </p>
        )
        return (
          <p key={i} style={{ ...body, margin: i === 0 ? 0 : '6px 0 0' }}>
            <InlineCode text={line} />
          </p>
        )
      })}
    </div>
  )
}

// The Focus deck re-renders on every pointermove while a card is being dragged, and each
// Section re-splits its text and runs three regexes per line. Memoising on the task keeps that
// work from repeating 60+ times a second for cards whose prose has not changed.
export const TaskSections = memo(function TaskSections({ task, large = false }: { task: Task; large?: boolean }) {
  return (<>
    <Section name="Problem" text={task.problem} tone="problem" large={large} />
    <Section name="What to do" text={task.todo} tone="action" large={large} />
    <Section name="Expected outcome" text={task.outcome} tone="outcome" large={large} />
  </>)
})

export function TaskCard({ task, index, checked, onToggle, resolveDep, onSelect, collapsed, onToggleExpand }: {
  task: Task
  index: number
  checked?: boolean
  onToggle?: () => void
  resolveDep?: (title: string) => { done: boolean } | null
  onSelect?: () => void
  collapsed: boolean
  onToggleExpand: () => void
}) {
  const hue = cardHue(index)
  // one click both reveals the detail and points the diagram at this task
  const onTitleClick = () => { onToggleExpand(); onSelect?.() }
  const titleHint = collapsed ? 'Show detail and highlight in the diagram' : 'Hide detail'
  // While collapsed the whole card is the hit target. Once open, only the header row closes
  // it again — the body has to stay selectable, since copying a file path out of "What to do"
  // is the main thing people do there, and a click-to-collapse body would fight that.
  const onCardClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('button, a')) return // the card holds no other controls; these keep their clicks
    if (!collapsed && !el.closest('[data-task-header]')) return
    onTitleClick()
  }
  // the error line stands in for the sections, so it stays visible while collapsed: errors mean
  // this task gets SKIPPED at ship time, which a list you are scanning must not hide. Dependency
  // warnings (in DepChips) do stay hidden until expanded — they block nothing, so they can wait.
  const hasError = task.errors.length > 0
  return (
    <div
      className="card"
      data-clickable={collapsed ? '' : undefined}
      onClick={onCardClick}
      style={{
        borderColor: hasError ? 'var(--warn-border)' : 'var(--border)',
        borderTop: `3px solid ${hue}`,
        opacity: checked ? 0.8 : undefined,
      }}
    >
      <div
        data-task-header=""
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed && !hasError ? 0 : 10, gap: 8, cursor: 'pointer' }}
      >
        {/* the accessible control stays on the title (a role=button wrapping the Approve
            button would be invalid nesting); the card click above is a mouse convenience */}
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
          title={titleHint}
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTitleClick() }
          }}
        >
          <span className="caret" aria-hidden="true" style={{ transform: collapsed ? 'none' : 'rotate(90deg)' }}>▸</span>
          <span className="icon-chip" style={{ background: `color-mix(in srgb, ${hue} 14%, transparent)` }}>{taskIcon(task)}</span>
          <span className="serif" style={{ fontSize: 17, fontWeight: 600 }}>{task.title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!collapsed && <CopyPromptButton task={task} />}
          {onToggle && !hasError && (
            <button
              className={`btn-done${checked ? ' checked' : ''}`}
              style={{ height: 28, fontSize: 12, padding: '0 12px', whiteSpace: 'nowrap' }}
              onClick={onToggle}
            >
              {checked ? '✓ Approved' : 'Approve'}
            </button>
          )}
          <span className="pill" style={{ color: hue, background: `color-mix(in srgb, ${hue} 14%, transparent)`, whiteSpace: 'nowrap' }}>
            Task {index + 1}
          </span>
        </span>
      </div>
      {!collapsed && <DepChips task={task} resolved={resolveDep} />}
      {hasError ? (
        <p style={{ fontSize: 13, color: 'var(--warn)', margin: 0 }}>
          ⚠ {task.errors.join(', ')} — this task will be skipped.
        </p>
      ) : !collapsed && <TaskSections task={task} />}
    </div>
  )
}
