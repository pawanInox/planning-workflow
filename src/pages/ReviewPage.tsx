import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Task } from '../../shared/parse'
import { groupTasks } from '../../shared/groups'
import { TaskBody, TaskRow, CopyButton } from '../components/TaskCard'
import { CardViewer } from '../components/CardViewer'
import { DiagramPanel } from '../components/DiagramPanel'
import { SpecPanel } from '../components/SpecPanel'
import { Icon } from '../components/Icon'
import type { Owner, Spec } from '../lib/api'
import { hasSidePane, isTypingTarget, pad, toggled } from '../lib/ui'

export type SyncState = 'saved' | 'syncing' | 'error'

type Pane = 'flow' | 'seq' | 'spec'

const SYNC_LABEL: Record<SyncState, string> = { saved: 'Saved · live', syncing: 'Syncing…', error: 'Not saved' }

export function ReviewPage({ planTitle, tasks, done, setDone, view, setView, sync, syncError, projectId, onEdit, onMenu, diagram, seqDiagram = '', spec = null, taskNodes, taskRefs = [], flash = null, readOnly = false, owner = null }: {
  planTitle: string
  tasks: Task[]
  done: Set<number>
  setDone: Dispatch<SetStateAction<Set<number>>>
  view: 'focus' | 'list'
  setView: (v: 'focus' | 'list') => void
  sync: SyncState
  syncError: string
  projectId: string | null
  /** absent for a reader: only the owner may turn the plan back into markdown */
  onEdit?: () => void
  onMenu: () => void
  diagram: string
  seqDiagram?: string
  spec?: Spec | null
  /** diagram node ids per task, index-aligned with `tasks` */
  taskNodes: string[][]
  /** spec entry ids per task, index-aligned with `tasks` — the counterpart of `taskNodes` */
  taskRefs?: string[][]
  /** tasks just changed through the API (App clears it once the flash has played) */
  flash?: { indices: Set<number>; n: number } | null
  /** someone else's project: browse and copy, never approve or edit */
  readOnly?: boolean
  owner?: Owner | null
}) {
  const [focusTop, setFocusTop] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  // task indices whose detail is open — a set (not one index) so opening a task never closes another
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // which of flowchart / sequence / spec fills the side pane; falls back to whichever exists, so a
  // project that has only one of the three needs no toggle and never renders an empty pane
  const [pane, setPane] = useState<Pane>('flow')
  const [specRaw, setSpecRaw] = useState(false)
  const [ping, setPing] = useState<{ id: string; n: number } | null>(null)
  const [ctxOpen, setCtxOpen] = useState(false) // only matters below 1180px, where the pane is a drawer

  // the chosen pane if this project has it, else the first one it does have
  const has: Record<Pane, boolean> = { flow: Boolean(diagram), seq: Boolean(seqDiagram), spec: Boolean(spec) }
  const current: Pane = has[pane] ? pane : diagram ? 'flow' : seqDiagram ? 'seq' : 'spec'
  const showSpec = current === 'spec'
  const shownDiagram = current === 'seq' ? seqDiagram : diagram
  const hasCtx = hasSidePane({ diagram, seqDiagram, spec })
  const active = view === 'focus' ? focusTop : selected
  // independent tracks: no track depends on a task in another, so each can be handed off separately
  const tracks = useMemo(() => groupTasks(tasks), [tasks])
  const specIds = useMemo(() => (spec ? new Set(Object.values(spec).flat().map(e => e.id)) : null), [spec])

  function showSpecEntry(id: string, from?: number) {
    if (from !== undefined) setSelected(from)
    setPane('spec'); setSpecRaw(false)
    // wide screens show the pane inline; opening the drawer there would only spring it open on a later resize
    if (matchMedia('(max-width: 1180px)').matches) setCtxOpen(true)
    setPing(p => ({ id, n: (p?.n ?? 0) + 1 }))
  }

  function jumpInList(i: number) {
    setSelected(i)
    setExpanded(prev => new Set(prev).add(i))
    requestAnimationFrame(() => document.querySelector(`[data-task="${i}"]`)?.scrollIntoView({ block: 'nearest' }))
  }

  // F / L switch views; the deck owns ← → Z
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (e.key === 'f') setView('focus')
      if (e.key === 'l') setView('list')
      if (e.key === 'Escape') setCtxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView])

  const tabs: [Pane, string][] = []
  if (diagram) tabs.push(['flow', 'Flowchart'])
  if (seqDiagram) tabs.push(['seq', 'Sequence'])
  if (spec) tabs.push(['spec', 'Spec'])

  const list = (
    <div className="list">
      <div className="progress">
        <div className="bar"><i className="d" style={{ width: `${(done.size / tasks.length) * 100}%` }} /></div>
        <span className="progress-txt num"><b>{done.size}</b>/{tasks.length} approved</span>
        <button className="btn btn-ghost sm" onClick={() => setExpanded(expanded.size ? new Set() : new Set(tasks.map((_, i) => i)))}>
          {expanded.size ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {tracks.map((track, ti) => (
        // keyed by the track's lowest task index — unique, and stable across polls
        <section key={track[0]}>
          {tracks.length > 1 && (
            <div className="track-head">
              <span className="eyebrow">Track {ti + 1}</span>
              <span className="note num">{track.filter(i => done.has(i)).length}/{track.length} approved</span>
              {ti === 0 && <span className="note push hide-mobile">Tracks share no dependencies, so each can go to a different person</span>}
            </div>
          )}
          <div className="surface track">
            {track.map(i => (
              <TaskRow
                key={i}
                task={tasks[i]}
                index={i}
                checked={done.has(i)}
                selected={selected === i}
                expanded={expanded.has(i)}
                flash={flash?.indices.has(i)}
                readOnly={readOnly}
                onToggle={() => setDone(prev => toggled(prev, i))}
                onOpen={() => { setSelected(i); setExpanded(prev => toggled(prev, i)) }}
              >
                <TaskBody task={tasks[i]} tasks={tasks} done={done} refs={taskRefs[i]} specIds={specIds}
                  onJump={jumpInList} onSpecRef={id => showSpecEntry(id, i)} />
              </TaskRow>
            ))}
          </div>
        </section>
      ))}
    </div>
  )

  return (<>
    <main className="main">
      <header className="head">
        <button className="btn btn-ghost sq only-mobile" onClick={onMenu} aria-label="Open projects"><Icon name="menu" /></button>
        <h1 title={planTitle}>{planTitle || 'Untitled plan'}</h1>
        {readOnly ? (
          <span className="chip reader-badge" title="Approvals and edits belong to the owner">
            {owner?.avatarUrl && <img className="avatar sm" src={owner.avatarUrl} alt="" referrerPolicy="no-referrer" />}
            Read-only · {owner ? `owned by ${owner.name}` : 'no owner yet'}
          </span>
        ) : (
          <span className="sync hide-mobile" data-s={sync} title={syncError || undefined} role="status"><i /><span>{SYNC_LABEL[sync]}</span></span>
        )}
        <span className="grow" />
        <div className="seg" role="tablist" aria-label="Review mode">
          <button role="tab" aria-selected={view === 'focus'} onClick={() => setView('focus')} title="Focus (F)"><Icon name="cards" /><span className="hide-mobile">Focus</span></button>
          <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} title="List (L)"><Icon name="list" /><span className="hide-mobile">List</span></button>
        </div>
        {hasCtx && <button className="btn btn-ghost sq only-narrow" onClick={() => setCtxOpen(true)} aria-label="Show diagram and spec"><Icon name="panel" /></button>}
        {onEdit && <button className="btn btn-ghost sq hide-mobile" onClick={onEdit} aria-label="Edit as markdown" title="Edit as markdown"><Icon name="edit" /></button>}
        {projectId && (
          <CopyButton icon="link" label="Copy link" iconOnly className="hide-mobile" title="Copy a link that opens this project"
            text={() => `${location.origin}/?project=${projectId}`} />
        )}
      </header>
      <div className="body">
        {view === 'focus'
          ? <CardViewer tasks={tasks} done={done} setDone={setDone} onTopChange={setFocusTop}
              taskRefs={taskRefs} specIds={specIds} onSpecRef={id => showSpecEntry(id)} flash={flash} readOnly={readOnly} />
          : list}
      </div>
    </main>
    {hasCtx && (<>
      {ctxOpen && <div className="scrim ctx-scrim" onClick={() => setCtxOpen(false)} />}
      <aside className={`ctx${ctxOpen ? ' open' : ''}`} aria-label="Diagram and spec">
        <div className="ctx-head">
          {tabs.length > 1 && (
            <div className="seg" role="tablist" aria-label="Context view">
              {tabs.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={current === k} onClick={() => setPane(k)}><Icon name={k} />{label}</button>
              ))}
            </div>
          )}
          <span className="grow" />
          {showSpec && (
            <button className="btn btn-ghost sm" aria-pressed={specRaw} onClick={() => setSpecRaw(r => !r)}>
              {specRaw ? 'Rendered' : 'Raw JSON'}
            </button>
          )}
          <button className="btn btn-ghost sq only-narrow" onClick={() => setCtxOpen(false)} aria-label="Close panel"><Icon name="x" /></button>
        </div>
        <div className="ctx-focus">
          {active != null && tasks[active]
            ? <><span className="dot" /><span>Highlighting</span><b>{pad(active)} · {tasks[active].title}</b></>
            : <span>{view === 'list' ? 'Select a task to highlight what it touches' : 'Nothing to highlight'}</span>}
        </div>
        {showSpec && spec
          ? <SpecPanel spec={spec} highlightIds={active != null ? taskRefs[active] ?? [] : []} raw={specRaw} ping={ping} />
          : <DiagramPanel source={shownDiagram} highlightNodes={active != null ? taskNodes[active] ?? [] : []} spec={spec} />}
      </aside>
    </>)}
  </>)
}
