import { useEffect, useMemo, useRef, useState } from 'react'
import { parsePlan, planToMarkdown } from '../shared/parse'
import { TaskCard, cardHue, taskIcon } from './TaskCard'
import { CardViewer } from './CardViewer'
import { getTheme, setTheme, type Theme } from './theme'

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const ICON: Record<Theme, string> = { light: '☀️', dark: '🌙', system: '💻' }

function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme())
  useEffect(() => { setTheme(theme) }, [])
  function cycle() {
    const next = NEXT[theme]
    setTheme(next)
    setLocal(next)
  }
  return (
    <button className="btn-ghost" onClick={cycle} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}`}>
      {ICON[theme]}
    </button>
  )
}

type Team = { id: string; name: string; key: string }
type Created = { title: string; url: string }
type ProjectSummary = { id: string; title: string; taskCount: number; doneCount: number; updatedAt: string }
type SavedTask = {
  id: string; title: string; problem: string; todo: string; outcome: string
  dependsOn: { title: string; reason: string }[]; done: boolean
}

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

export function App() {
  const [md, setMd] = useState('')
  const [step, setStep] = useState<'input' | 'review' | 'create'>('input')
  const [view, setView] = useState<'focus' | 'list'>('focus')
  const [done, setDone] = useState<Set<number>>(new Set())
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Created[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskIds, setTaskIds] = useState<(string | undefined)[]>([])
  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([])
  const [saveError, setSaveError] = useState('')
  const saving = useRef(false)
  const syncedDone = useRef<Set<number>>(new Set())
  const serverMd = useRef('') // serialized server state; poll re-hydrates only when it changes

  function copyFormatPrompt() {
    navigator.clipboard.writeText(FORMAT_PROMPT + md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // deep link: /?project=<id> opens that project straight into review
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('project')
    if (pid) openProject(pid)
  }, [])

  useEffect(() => {
    fetch('/api/teams')
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json() })
      .then((t: Team[]) => { setTeams(t); if (t[0]) setTeamId(t[0].id) })
      .catch(e => setError(String(e.message ?? e)))
  }, [])

  const { planTitle, tasks } = useMemo(() => parsePlan(md), [md])
  const shippable = [...done].sort((a, b) => a - b).map(i => tasks[i]).filter(t => t && t.errors.length === 0)

  useEffect(() => {
    if (step !== 'input') return
    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : []))
      .then(setSavedProjects)
      .catch(() => setSavedProjects([]))
  }, [step])

  async function saveProject() {
    if (saving.current) return
    saving.current = true
    setSaveError('')
    try {
      const payload = {
        title: planTitle || 'Untitled plan',
        tasks: tasks
          .map((t, i) => t.errors.length ? null : ({
            title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
            dependsOn: t.dependsOn, done: done.has(i),
          }))
          .filter(Boolean),
      }
      const r = await fetch(projectId ? `/api/projects/${projectId}` : '/api/projects', {
        method: projectId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      const p: { id: string; tasks: SavedTask[] } = await r.json()
      let j = 0
      setTaskIds(tasks.map(t => (t.errors.length ? undefined : p.tasks[j++]?.id)))
      syncedDone.current = new Set(done)
      serverMd.current = planToMarkdown(planTitle || 'Untitled plan', p.tasks)
      setProjectId(p.id)
    } catch (e: any) {
      setSaveError(String(e.message ?? e))
    } finally {
      saving.current = false
    }
  }

  async function openProject(id: string) {
    try {
      const r = await fetch(`/api/projects/${id}`)
      if (!r.ok) throw new Error((await r.json()).error)
      const p: { id: string; title: string; tasks: SavedTask[] } = await r.json()
      const doneSet = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
      const fresh = planToMarkdown(p.title, p.tasks)
      setMd(fresh)
      setDone(doneSet)
      setCreated([])
      setTaskIds(p.tasks.map(t => t.id))
      syncedDone.current = doneSet
      serverMd.current = fresh
      setProjectId(p.id)
      setSaveError('')
      setStep('review')
    } catch (e: any) {
      setError(String(e.message ?? e))
    }
  }

  // reflect external edits (e.g. Claude PATCHing tasks via the API) while reviewing
  useEffect(() => {
    if (step !== 'review' || !projectId) return
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}`)
        if (!r.ok) return
        const p: { id: string; title: string; tasks: SavedTask[] } = await r.json()
        const fresh = planToMarkdown(p.title, p.tasks)
        if (fresh === serverMd.current) return
        // ponytail: a done-toggle PATCH racing an external edit can be briefly overwritten; refetch-after-write if it ever matters
        const doneSet = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
        serverMd.current = fresh
        setMd(fresh)
        setDone(doneSet)
        syncedDone.current = doneSet
        setTaskIds(p.tasks.map(t => t.id))
      } catch { /* api unreachable — keep reviewing locally */ }
    }, 3000)
    return () => clearInterval(poll)
  }, [step, projectId])

  useEffect(() => {
    if (!projectId) return
    const prev = syncedDone.current
    const patch = (i: number, isDone: boolean) => {
      const tid = taskIds[i]
      if (!tid) return
      fetch(`/api/projects/${projectId}/tasks/${tid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: isDone }),
      })
        .then(r => { if (!r.ok) console.warn(`done sync failed for task ${i}: ${r.status}`) })
        .catch(e => console.warn(`done sync failed for task ${i}:`, e))
    }
    for (const i of done) if (!prev.has(i)) patch(i, true)
    for (const i of prev) if (!done.has(i)) patch(i, false)
    syncedDone.current = new Set(done)
  }, [done, projectId])

  async function create() {
    setBusy(true); setError(''); setCreated([])
    try {
      const r = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, tasks: shippable }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      const data = await r.json()
      setCreated(data.created)
      if (data.relationErrors?.length) setError(`Issues created, but some links failed: ${data.relationErrors.join('; ')}`)
    } catch (e: any) {
      setError(String(e.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'input') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh' }}>
        <span className="blob" style={{ width: 320, height: 320, top: -80, right: -60, background: 'var(--lime)' }} />
        <span className="blob" style={{ width: 280, height: 280, bottom: -60, left: -80, background: 'var(--card-hue-1)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
          <ThemeToggle />
        </div>
        <header style={{ padding: '8px 0 0', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>🃏</div>
          <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0 }}>Plan to Linear</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            1 · Paste a plan &nbsp;→&nbsp; 2 · Review card by card &nbsp;→&nbsp; 3 · Ship the done ones to Linear
          </p>
        </header>

        <textarea
          value={md}
          onChange={e => {
            setMd(e.target.value)
            setDone(new Set()); setCreated([])
            setProjectId(null); setTaskIds([]); syncedDone.current = new Set()
          }}
          placeholder={'# Plan: title\n\n## Task: task title\n### Problem\n### What to do\n### Expected outcome'}
          className="card"
          style={{ flex: 1, minHeight: 320, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.7, resize: 'none' }}
        />

        {savedProjects.length > 0 && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Saved projects
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedProjects.map(p => (
                <button
                  key={p.id}
                  className="btn-ghost"
                  onClick={() => openProject(p.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <span className="pill" style={{ color: 'var(--badge-text)', background: 'var(--badge-bg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {p.doneCount}/{p.taskCount} done · {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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
          <button
            className="btn-primary"
            disabled={tasks.length === 0}
            onClick={() => {
              void saveProject() // auto-create (or update) the project; review doesn't wait on it
              setStep('review')
            }}
          >
            Start review →
          </button>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0 10px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button className="btn-ghost" onClick={() => setStep('input')}>← Edit plan</button>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {planTitle || 'Untitled plan'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveError && <span style={{ fontSize: 12, color: 'var(--warn)' }} title={saveError}>⚠ not saved</span>}
            <ThemeToggle />
            <button className={`btn-ghost${view === 'focus' ? ' active' : ''}`} onClick={() => setView('focus')}>Focus</button>
            <button className={`btn-ghost${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
            <button className="btn-primary" disabled={done.size === 0} onClick={() => setStep('create')}>
              Ship ({done.size}) →
            </button>
          </div>
        </header>

        {view === 'focus' ? (
          <CardViewer tasks={tasks} done={done} setDone={setDone} onShip={() => setStep('create')} />
        ) : (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              ⚡ {done.size} / {tasks.length} done
            </span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${(done.size / tasks.length) * 100}%` }} />
            </div>
          </div>
          {tasks.map((t, i) => (
            <TaskCard
              key={i}
              task={t}
              index={i}
              checked={done.has(i)}
              resolveDep={dep => {
                const di = tasks.findIndex(x => x.title.toLowerCase() === dep.toLowerCase())
                return di === -1 ? null : { done: done.has(di) }
              }}
              onToggle={() => setDone(prev => {
                const next = new Set(prev)
                next.has(i) ? next.delete(i) : next.add(i)
                return next
              })}
            />
          ))}
        </>)}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 0 10px', borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn-ghost" onClick={() => setStep('review')}>← Back to review</button>
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Ship to Linear</h1>
        <span style={{ marginLeft: 'auto' }}><ThemeToggle /></span>
      </header>

      <div className="card">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          {shippable.length} task{shippable.length === 1 ? '' : 's'} cleared in review
        </p>
        {shippable.map(t => {
          const idx = tasks.indexOf(t)
          return (
            <p key={idx} style={{ fontSize: 14, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: cardHue(idx), flexShrink: 0 }} />
              <span className="serif" style={{ fontWeight: 600 }}>{t.title}</span>
              <span style={{ color: 'var(--success)', marginLeft: 'auto' }}>✓</span>
            </p>
          )
        })}
        {shippable.length === 0 && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Nothing cleared yet — go back and swipe some tasks right.
          </p>
        )}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Team</label>
        <select className="control" value={teamId} onChange={e => setTeamId(e.target.value)}>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.key})</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={create} disabled={busy || !teamId || shippable.length === 0 || created.length > 0}>
          {busy ? 'Creating…' : created.length > 0 ? 'Created ✓' : `Create ${shippable.length} issue${shippable.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      {created.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--success-border)' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--success)', margin: '0 0 8px' }}>🏆 Created in Linear</p>
          {created.map(c => (
            <p key={c.url} style={{ fontSize: 13, margin: '0 0 4px' }}>
              <a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{c.title}</a>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
