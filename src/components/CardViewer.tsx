import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ReactNode } from 'react'
import { resolveDepIndex, type Task } from '../../shared/parse'
import { api } from '../lib/api'
import { TaskSections, DepChips, CopyPromptButton, cardHue, taskIcon, taskMemeQuery } from './TaskCard'

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Dir = 'left' | 'right'
const THROW = 120
// A released card must keep going the way it was thrown — never snap back to a fixed distance,
// which reads as the card refusing to follow your hand. It continues from wherever the drag ended,
// far enough to be gone: off screen to the right, behind the diagram frame to the left.
const EXIT_MIN = 900
// the deck waits this long before dropping the card, so it must match the CSS duration below or
// the card is culled mid-flight
const EXIT_MS = 420

function Meme({ query, fallback }: { query: string; fallback?: ReactNode }) {
  const [meme, setMeme] = useState<{ url: string; pageUrl: string; title: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading'); setMeme(null)
    api.getMeme(query)
      .then(m => { if (alive && m.url) { setMeme(m); setState('ok') } else if (alive) setState('none') })
      .catch(() => { if (alive) setState('none') })
    return () => { alive = false }
  }, [query])

  if (state === 'none') return <>{fallback ?? null}</>
  if (state === 'loading') return <>{fallback ?? <div className="meme-skel" />}</>
  return (
    <div style={{ margin: '0 0 16px', textAlign: 'center' }}>
      <img src={meme!.url} alt={meme!.title || 'meme'} style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 12, display: 'block', margin: '0 auto' }} />
      <a href={meme!.pageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
        Powered by GIPHY
      </a>
    </div>
  )
}

export function CardViewer({ tasks, done, setDone, onShip, onTopChange, taskRefs = [], resolveRef }: {
  tasks: Task[]
  done: Set<number>
  setDone: Dispatch<SetStateAction<Set<number>>>
  onShip: () => void
  onTopChange?: (index: number | null) => void
  /** spec entry ids per task, index-aligned with `tasks` */
  taskRefs?: string[][]
  resolveRef?: (id: string) => string | null
  /** a task's resolved spec slice, by task index — carried into the copied agent prompts */
}) {
  const [queue, setQueue] = useState<number[]>([])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<{ index: number; dir: Dir }[]>([])
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState<Dir | null>(null)
  const [entering, setEntering] = useState<Dir | null>(null)
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  const top = queue[0]

  useEffect(() => { onTopChange?.(top ?? null) }, [top])

  function commit(dir: Dir) {
    if (top === undefined || leaving) return
    setLeaving(dir)
    if (dir === 'right') setDone(prev => new Set(prev).add(top))
    else setSkipped(s => new Set(s).add(top))
    setHistory(h => [...h, { index: top, dir }])
    commitTimer.current = setTimeout(() => {
      setQueue(q => q.slice(1))
      setDx(0); setLeaving(null)
    }, EXIT_MS)
  }

  function undo() {
    if (history.length === 0 || leaving) return
    const last = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setDone(prev => { const d = new Set(prev); d.delete(last.index); return d })
    setSkipped(s => { const n = new Set(s); n.delete(last.index); return n })
    setQueue(q => [last.index, ...q])
    if (!reducedMotion()) setEntering(last.dir)
  }

  function jumpTo(i: number) {
    if (i === top || leaving) return
    const swipedDir = history.find(x => x.index === i)?.dir
    setDone(prev => { const d = new Set(prev); d.delete(i); return d })
    setSkipped(s => { const n = new Set(s); n.delete(i); return n })
    setHistory(h => h.filter(x => x.index !== i))
    setQueue(q => [i, ...q.filter(x => x !== i)])
    if (!reducedMotion() && swipedDir) setEntering(swipedDir)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') { e.preventDefault(); commit('right') }
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit('left') }
      if (e.key === 'ArrowUp' || e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top, leaving, done, history])

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return
    start.current = { x: e.clientX, y: e.clientY, swiping: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current
    if (!s || leaving) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (!s.swiping && Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
      s.swiping = true
      setDragging(true)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
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

  const doneCount = done.size
  const pct = doneCount / tasks.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          ⚡ {doneCount} / {tasks.length} done{skipped.size > 0 ? ` · ${skipped.size} skipped` : ''}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6, padding: '0 4px' }}>
        {tasks.map((t, i) => {
          const isTop = i === top
          return (
            <button
              key={i}
              title={`${i + 1} · ${t.title}`}
              aria-label={`Go to task ${i + 1}`}
              onClick={() => jumpTo(i)}
              style={{
                width: isTop ? 22 : 10,
                height: 10,
                borderRadius: 999,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: isTop ? cardHue(i) : done.has(i) ? 'var(--lime)' : skipped.has(i) ? 'var(--sec-problem)' : 'var(--border)',
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          )
        })}
      </div>

      <div className="deck">
        {queue.length === 0 ? (
          <div className="deck-card" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <Meme
              query={pct === 1 ? 'victory celebration' : 'shrug'}
              fallback={<div className={pct === 1 ? 'bounce' : ''} style={{ fontSize: 64, marginBottom: 12 }}>{pct === 1 ? '🏆' : '🎯'}</div>}
            />
            <h2 style={{ fontSize: 32, margin: '0 0 4px' }}>
              {pct === 1 ? 'All done!' : 'Review finished'}
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '0 0 20px' }}>
              {doneCount} done · {skipped.size} skipped
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {doneCount > 0 && (
                <button className="btn-primary" onClick={onShip}>
                  Ship {doneCount} task{doneCount === 1 ? '' : 's'} to Linear →
                </button>
              )}
              {skipped.size > 0 && (
                <button className="btn-done" onClick={() => { setQueue([...skipped]); setSkipped(new Set()); setHistory([]) }}>
                  Replay {skipped.size} skipped
                </button>
              )}
              <button className="btn-ghost" onClick={() => { setQueue(tasks.map((_, i) => i)); setDone(new Set()); setSkipped(new Set()); setHistory([]) }}>
                Restart run
              </button>
              {history.length > 0 && (
                <button className="btn-ghost" onClick={undo}>↩ Undo last swipe</button>
              )}
            </div>
          </div>
        ) : (
          queue.slice(0, 3).map((taskIdx, stackPos) => {
            const t = tasks[taskIdx]
            const isTop = stackPos === 0
            // continue past the drag rather than resetting to a constant (dx still holds where the
            // hand let go); a keyboard/button commit has dx 0 and just uses the minimum
            const throwX = leaving === 'right' ? Math.max(EXIT_MIN, dx + 400)
              : leaving === 'left' ? Math.min(-EXIT_MIN, dx - 400) : 0
            const enterX = entering === 'right' ? EXIT_MIN : entering === 'left' ? -EXIT_MIN : 0
            const x = isTop ? (leaving ? throwX : entering ? enterX : dx) : 0
            // fade on the way OUT only. Fading the ENTERING card too would hide it until `entering`
            // clears, and that clear rides on requestAnimationFrame — if a frame is delayed, an
            // undone card would sit invisible. It slides back in at full opacity instead.
            const gone = isTop && !!leaving
            const transform = isTop
              ? `translateX(${x}px) rotate(${x * 0.05}deg)`
              : `scale(${1 - stackPos * 0.045}) translateY(${stackPos * 14}px)`
            return (
              <div
                key={taskIdx}
                className="deck-card"
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? onPointerUp : undefined}
                onPointerCancel={isTop ? onPointerUp : undefined}
                style={{
                  zIndex: 10 - stackPos,
                  borderTop: `4px solid ${cardHue(taskIdx)}`,
                  transform,
                  opacity: gone ? 0 : 1,
                  transition: (dragging || entering) && isTop
                    ? 'none'
                    // ease-OUT on the throw so it leaves with momentum; ease-IN on the fade so the
                    // card stays solid while it travels instead of dissolving on the spot
                    : `transform ${EXIT_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${EXIT_MS}ms ease-in`,
                  cursor: isTop ? 'grab' : 'default',
                  userSelect: dragging ? 'none' : 'auto',
                }}
              >
                {isTop && (
                  <>
                    <span className="stamp" style={{ left: 20, color: 'var(--sec-outcome)', borderColor: 'var(--sec-outcome)', transform: 'rotate(-14deg)', opacity: Math.min(Math.max(dx, 0) / THROW, 1) }}>
                      ✓ APPROVE
                    </span>
                    <span className="stamp" style={{ right: 20, color: 'var(--sec-problem)', borderColor: 'var(--sec-problem)', transform: 'rotate(14deg)', opacity: Math.min(Math.max(-dx, 0) / THROW, 1) }}>
                      SKIP
                    </span>
                  </>
                )}
                <span className="level-num">{String(taskIdx + 1).padStart(2, '0')}</span>
                {/* .quest-head wraps and .task-head-actions spaces the buttons — the same pair the
                    List card uses. In a plain span the two buttons had no gap at all and the
                    unwrappable row pushed them past the card's edge on a phone. */}
                <div className="quest-head">
                  <span className="icon-hero" style={{ background: `color-mix(in srgb, ${cardHue(taskIdx)} 16%, transparent)` }}>
                    {taskIcon(t)}
                  </span>
                  <span className="pill" style={{ color: 'var(--on-lime)', background: 'var(--lime)', fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 12, padding: '2px 9px', letterSpacing: '0.08em' }}>
                    QUEST {String(taskIdx + 1).padStart(2, '0')}/{String(tasks.length).padStart(2, '0')}
                  </span>
                  <span className="task-head-actions">
                    <CopyPromptButton task={t} />
                  </span>
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.25 }}>{t.title}</h2>
                <DepChips
                  task={t}
                  resolved={dep => {
                    const di = resolveDepIndex(tasks, dep)
                    return di === -1 ? null : { done: done.has(di), onClick: () => jumpTo(di) }
                  }}
                  specRefs={taskRefs[taskIdx]}
                  resolveRef={resolveRef}
                />
                {t.errors.length > 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--warn)', margin: 0 }}>
                    ⚠ {t.errors.join(', ')} — this task will be skipped on create.
                  </p>
                ) : (
                  <TaskSections task={t} large />
                )}
                {isTop && (
                  <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Meme query={taskMemeQuery(t)} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {queue.length > 0 && (
        <div className="deck-actions">
          <button className="btn-ghost" onClick={undo} disabled={history.length === 0}>↩ Undo</button>
          <button className="btn-ghost" onClick={() => commit('left')}>✗ Skip</button>
          {/* hidden on touch layouts: it names keys a phone does not have, and squeezing it
              between the buttons was breaking each of them onto its own line */}
          <span className="deck-hint">drag the card or use ← → · z to undo</span>
          <button className="btn-done" onClick={() => commit('right')}>✓ Approve</button>
        </div>
      )}
    </div>
  )
}
