import { useState } from 'react'
import type { Task } from '../../shared/parse'
import { cardHue, taskIcon } from '../components/TaskCard'
import { ThemeToggle } from '../components/ThemeToggle'

const FORMAT_PROMPT = `Reformat the plan below into EXACTLY this markdown structure (a parser reads it, so headings must match verbatim):

# Plan: <short plan title>

## Task: <imperative task title>
### Problem
<why this task exists, 1-3 sentences>
Scenario: <one concrete example — a real role does X, and today Y (the wrong thing) happens>
### What to do
<detailed concrete steps, real file paths and commands, enough for someone with zero context>
### Expected outcome
<a verifiable end state>
Before: <what happens today in the scenario above>
After: <what happens once done — same scenario, fixed result>
### Depends on
- <exact title of another task in this plan> — <one line: what concretely breaks in THIS task if that dependency is not done first>
(optional section — one line per dependency; omit entirely when none)

Rules: repeat the "## Task:" block per task; every task self-contained (repeat context, never say "the task above"); task titles imperative and unique; order tasks by execution order; 3-10 tasks; wrap file paths and function names in backticks; keep the original language of the plan for all content, but the headings and the words "Scenario:", "Before:", "After:" must stay in English exactly as shown.

IMPORTANT — output format: reply with ONE fenced code block starting with \`\`\`markdown and ending with \`\`\`, containing the entire formatted plan as raw markdown, and NOTHING outside the code block (no intro, no explanation). The user will copy the block's contents verbatim into an app that parses these exact headings.

Here is the plan to reformat:

`

export function InputPage({ md, tasks, hasProjects, onMdChange, onShowProjects, onStartReview }: {
  md: string
  tasks: Task[]
  hasProjects: boolean
  onMdChange: (value: string) => void
  onShowProjects: () => void
  onStartReview: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyFormatPrompt() {
    navigator.clipboard.writeText(FORMAT_PROMPT + md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh' }}>
      <span className="blob" style={{ width: 340, height: 340, top: -90, right: -70, background: 'var(--accent)' }} />
      <span className="blob" style={{ width: 260, height: 260, bottom: -60, left: -80, background: 'var(--card-hue-1)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
        {hasProjects && (
          <button className="btn-ghost" onClick={onShowProjects}>📁 Projects</button>
        )}
        <ThemeToggle />
      </div>
      <header style={{ padding: '8px 0 0', textAlign: 'center' }}>
        <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>◆ quest log ◆</span>
        <h1 className="serif" style={{ fontSize: 44, fontWeight: 700, margin: 0, lineHeight: 1.1 }}>
          Yak Dai&nbsp;<span style={{ color: 'var(--accent)' }}>Tham Eng</span>
        </h1>
        <div className="eyebrow" style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', margin: '16px 0 0', fontSize: 11 }}>
          <span><span style={{ color: 'var(--accent)' }}>01</span> paste a plan</span>
          <span style={{ opacity: 0.4 }}>▸</span>
          <span><span style={{ color: 'var(--accent)' }}>02</span> review card by card</span>
          <span style={{ opacity: 0.4 }}>▸</span>
          <span><span style={{ color: 'var(--accent)' }}>03</span> ship to Linear</span>
        </div>
      </header>

      <textarea
        value={md}
        onChange={e => onMdChange(e.target.value)}
        placeholder={'# Plan: title\n\n## Task: task title\n### Problem\n### What to do\n### Expected outcome'}
        className="card"
        style={{ flex: 1, minHeight: 320, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.7, resize: 'none' }}
      />

      {tasks.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tasks.map((t, i) => (
            <span
              key={i}
              className="icon-chip"
              title={t.title}
              style={{
                background: `color-mix(in srgb, ${cardHue(i)} 16%, transparent)`,
                transform: `rotate(${(i % 5 - 2) * 4}deg)`,
                opacity: t.errors.length ? 0.35 : 1,
              }}
            >
              {taskIcon(t)}
            </span>
          ))}
        </div>
      )}

      {md.trim() !== '' && tasks.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--warn-border)', textAlign: 'center' }}>
          <p style={{ fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>🤖 This plan doesn't match the app's format</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            No problem — copy the prompt below (it already includes your plan), paste it into any AI, and paste the result back here.
          </p>
          <button className="btn-primary" onClick={copyFormatPrompt}>
            {copied ? '✓ Copied — paste it into your AI' : 'Copy AI format prompt + my plan'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 8 }}>
        {tasks.length > 0 && (
          <span className="pill" style={{ color: 'var(--badge-text)', background: 'var(--badge-bg)' }}>
            {tasks.length} task{tasks.length === 1 ? '' : 's'}
            {tasks.some(t => t.errors.length) ? ` · ${tasks.filter(t => t.errors.length).length} incomplete` : ''}
          </span>
        )}
        <button className="btn-primary" disabled={tasks.length === 0} onClick={onStartReview}>
          Start review →
        </button>
      </div>
    </div>
  )
}
