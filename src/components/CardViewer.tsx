import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Task } from '../../shared/parse'
import { groupTasks } from '../../shared/groups'
import { CopyPromptButtons, TaskBody } from './TaskCard'
import { Icon } from './Icon'
import { isTypingTarget, pad, prefersReducedMotion as reducedMotion, without } from '../lib/ui'

type Dir = 'left' | 'right'
const THROW = 120
// A released card must keep going the way it was thrown — never snap back to a fixed distance,
// which reads as the card refusing to follow your hand. It continues from wherever the drag ended.
const EXIT_MIN = 900
// the deck waits this long before dropping the card, so it must match the transition below or the
// card is culled mid-flight
const EXIT_MS = 340
const REDUCED_EXIT_MS = 150

const STATE = { top: 'current', done: 'approved', skip: 'skipped', '': 'not reviewed' } as const

export function CardViewer({ tasks, done, setDone, onTopChange, taskRefs, specIds, onSpecRef, flash, readOnly = false }: {
  tasks: Task[]
  done: Set<number>
  setDone: Dispatch<SetStateAction<Set<number>>>
  onTopChange?: (index: number | null) => void
  /** spec entry ids per task, index-aligned with `tasks` */
  taskRefs: string[][]
  specIds: Set<string> | null
  onSpecRef: (id: string) => void
  /** tasks just changed through the API (App clears it once the flash has played) */
  flash?: { indices: Set<number>; n: number } | null
  /** someone else's project: a viewer — ← → step through the cards; nothing to approve, skip or undo */
  readOnly?: boolean
}) {
  const [queue, setQueue] = useState<number[]>([])
  const [cursor, setCursor] = useState(0) // the viewer's position; the review queue is unused when readOnly
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<{ index: number; dir: Dir; wasDone: boolean }[]>([])
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState<Dir | null>(null)
  const [entering, setEntering] = useState<Dir | null>(null)
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tracks = useMemo(() => groupTasks(tasks), [tasks])

  useEffect(() => {
    if (!entering) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntering(null)))
    return () => cancelAnimationFrame(id)
  }, [entering])

  useEffect(() => {
    clearTimeout(commitTimer.current) // a pending commit belongs to the old task list
    setQueue(tasks.map((_, i) => i).filter(i => !done.has(i)))
    setSkipped(new Set()); setHistory([]); setDx(0); setLeaving(null)
    setDragging(false); start.current = null
  }, [tasks])

  useEffect(() => () => clearTimeout(commitTimer.current), [])

  const top = readOnly ? (tasks.length ? Math.min(cursor, tasks.length - 1) : undefined) : queue[0]
  const step = (by: number) => setCursor(c => Math.max(0, Math.min(tasks.length - 1, c + by)))

  useEffect(() => { onTopChange?.(top ?? null) }, [top])

  function commit(dir: Dir) {
    if (readOnly || top === undefined || leaving) return
    setLeaving(dir)
    // skip means "not approved", so skipping an approved card (reached via the rail) un-approves it
    if (dir === 'right') setDone(prev => new Set(prev).add(top))
    else { setSkipped(s => new Set(s).add(top)); setDone(prev => without(prev, top)) }
    setHistory(h => [...h, { index: top, dir, wasDone: done.has(top) }])
    commitTimer.current = setTimeout(() => {
      setQueue(q => q.slice(1))
      setDx(0); setLeaving(null)
    }, reducedMotion() ? REDUCED_EXIT_MS : EXIT_MS)
  }

  function undo() {
    if (readOnly || history.length === 0 || leaving) return
    const last = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    // restore what the card was before this swipe, not "unapproved" — it may have been approved already
    setDone(prev => (last.wasDone ? new Set(prev).add(last.index) : without(prev, last.index)))
    setSkipped(s => without(s, last.index))
    setQueue(q => [last.index, ...q])
    if (!reducedMotion()) setEntering(last.dir)
  }

  function jumpTo(i: number) {
    if (readOnly) { setCursor(i); return }
    if (i === top || leaving) return
    const swipedDir = history.find(x => x.index === i)?.dir
    // revisiting keeps an approval; only a pending skip is cleared so the card counts as unreviewed
    setSkipped(s => without(s, i))
    setHistory(h => h.filter(x => x.index !== i))
    setQueue(q => [i, ...q.filter(x => x !== i)])
    if (!reducedMotion() && swipedDir) setEntering(swipedDir)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (readOnly) {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
        return
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); commit('right') }
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit('left') }
      if (e.key === 'ArrowUp' || e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top, leaving, done, history, readOnly, tasks.length])

  function onPointerDown(e: React.PointerEvent) {
    if (leaving || e.button !== 0 || (e.target as Element).closest('button, a')) return
    start.current = { x: e.clientX, y: e.clientY, swiping: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current
    if (!s || leaving) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    // horizontal intent only, so vertical scrolling and text selection inside the card still work
    if (!s.swiping && Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
      s.swiping = true
      setDragging(true)
      getSelection()?.removeAllRanges()
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    }
    if (s.swiping) setDx(ddx)
  }
  function onPointerUp() {
    const s = start.current
    start.current = null
    setDragging(false)
    if (!s?.swiping) return
    if (Math.abs(dx) > THROW) commit(dx > 0 ? 'right' : 'left')
    else setDx(0)
  }

  if (tasks.length === 0) return null

  const n = tasks.length
  const head = (
    <>
      <div className="progress">
        <div className="bar">
          <i className="d" style={{ width: `${(done.size / n) * 100}%` }} />
          <i className="s" style={{ width: `${(skipped.size / n) * 100}%` }} />
        </div>
        <span className="progress-txt num"><b>{done.size}</b>/{n} approved{skipped.size > 0 && ` · ${skipped.size} skipped`}</span>
      </div>
      <div className="rail" role="group" aria-label="Tasks">
        {tasks.map((t, i) => {
          const st = i === top ? 'top' : done.has(i) ? 'done' : skipped.has(i) ? 'skip' : ''
          return (
            <button key={i} data-st={st} onClick={() => jumpTo(i)}
              aria-label={`Task ${i + 1}, ${STATE[st]}: ${t.title}`} title={`${pad(i)} · ${STATE[st]} · ${t.title}`}>
              <i />
            </button>
          )
        })}
      </div>
    </>
  )

  if (top === undefined) {
    const all = done.size === n
    return (
      <div className="focus">
        {head}
        <div className="end">
          <div className="end-inner stagger">
            <span className="end-badge"><Icon name={all ? 'check' : 'cards'} /></span>
            <h2>{all ? 'All approved' : 'Review finished'}</h2>
            <p className="num">{done.size} approved · {skipped.size} skipped</p>
            <div className="row">
              {skipped.size > 0 && (
                <button className="btn btn-primary lg lead" onClick={() => { setQueue([...skipped].sort((a, b) => a - b)); setSkipped(new Set()); setHistory([]) }}>
                  <Icon name="retry" />Replay {skipped.size} skipped
                </button>
              )}
              <button className="btn btn-ghost lg" onClick={() => { setQueue(tasks.map((_, i) => i)); setDone(new Set()); setSkipped(new Set()); setHistory([]) }}>
                Start over
              </button>
              {history.length > 0 && <button className="btn btn-ghost lg lead" onClick={undo}><Icon name="undo" />Undo last</button>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const t = tasks[top]
  const reduced = reducedMotion()
  // continue past the drag rather than resetting to a constant (dx still holds where the hand let
  // go); a keyboard/button commit has dx 0 and just uses the minimum. Reduced motion: fade in place.
  const throwX = reduced ? 0 : leaving === 'right' ? Math.max(EXIT_MIN, dx + 400) : leaving === 'left' ? Math.min(-EXIT_MIN, dx - 400) : 0
  const enterX = entering === 'right' ? EXIT_MIN : entering === 'left' ? -EXIT_MIN : 0
  const x = leaving ? throwX : entering ? enterX : dx
  const ghosts = readOnly ? tasks.map((_, i) => i).slice(top + 1, top + 3) : queue.slice(1, 3)

  return (
    <div className="focus">
      {head}
      <div className="deck">
        {ghosts.map((i, k) => <div key={i} className={`card ghost g${k + 1}`} aria-hidden="true" />).reverse()}
        <article
          key={top}
          className={`card top${readOnly ? ' viewer' : ''}${dragging ? ' dragging' : ''}${flash?.indices.has(top) ? ' flash' : ''}`}
          aria-label={`Task ${top + 1}: ${t.title}`}
          onPointerDown={readOnly ? undefined : onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            transform: `translateX(${x}px) rotate(${x / 22}deg)`,
            opacity: leaving ? 0 : 1,
            transition: dragging || entering ? 'none'
              : reduced ? `opacity ${REDUCED_EXIT_MS}ms ease-out`
              : `transform ${EXIT_MS}ms cubic-bezier(0.2, 0, 0, 1), opacity ${EXIT_MS}ms ease-out`,
          }}
        >
          <div className="stamp yes" style={{ opacity: leaving === 'right' ? 1 : Math.min(Math.max(dx, 0) / THROW, 1) }}>Approve</div>
          <div className="stamp no" style={{ opacity: leaving === 'left' ? 1 : Math.min(Math.max(-dx, 0) / THROW, 1) }}>Skip</div>
          <div className="card-scroll">
            <div className="card-top">
              <span className="tag"><span className="dot" />{pad(top)} / {pad(n - 1)}</span>
              <span className="chip"><Icon name="tracks" />Track {tracks.findIndex(g => g.includes(top)) + 1}</span>
              {done.has(top) && <span className="chip ok"><Icon name="check" />Approved</span>}
              <span className="grow" />
              <CopyPromptButtons task={t} />
            </div>
            <h2>{t.title}</h2>
            <TaskBody task={t} tasks={tasks} done={done} refs={taskRefs[top]} specIds={specIds} onJump={jumpTo} onSpecRef={onSpecRef} />
          </div>
        </article>
      </div>
      {readOnly ? (
        <div className="deck-actions">
          <button className="btn btn-ghost lg lead" onClick={() => step(-1)} disabled={top === 0}><Icon name="chev-l" />Previous</button>
          <span className="hint">Read-only · approvals belong to the owner · <kbd>←</kbd> <kbd>→</kbd> to move</span>
          <button className="btn btn-outline lg trail" onClick={() => step(1)} disabled={top === tasks.length - 1}>Next<Icon name="chev-r" /></button>
        </div>
      ) : (
      <div className="deck-actions">
        <button className="btn btn-ghost lg lead" onClick={undo} disabled={history.length === 0}><Icon name="undo" />Undo</button>
        <span className="hint">Drag the card or press <kbd>←</kbd> <kbd>→</kbd> · <kbd>Z</kbd> undo</span>
        <button className="btn btn-skip lg lead" onClick={() => commit('left')}><Icon name="x" />Skip</button>
        <button className="btn btn-approve lg lead" onClick={() => commit('right')}><Icon name="check" />Approve</button>
      </div>
      )}
    </div>
  )
}
