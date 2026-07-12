import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Task } from '../../shared/parse'
import { TaskCard } from '../components/TaskCard'
import { CardViewer } from '../components/CardViewer'
import { ThemeToggle } from '../components/ThemeToggle'
import { DiagramPanel } from '../components/DiagramPanel'

export function ReviewPage({ planTitle, tasks, done, setDone, view, setView, saveError, backLabel, onBack, onShip, diagram, taskNodes }: {
  planTitle: string
  tasks: Task[]
  done: Set<number>
  setDone: Dispatch<SetStateAction<Set<number>>>
  view: 'focus' | 'list'
  setView: (v: 'focus' | 'list') => void
  saveError: string
  backLabel: string
  onBack: () => void
  onShip: () => void
  diagram: string
  taskNodes: string[][]
}) {
  const [showDiagram, setShowDiagram] = useState(false)
  const [focusTop, setFocusTop] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const active = view === 'focus' ? focusTop : selected
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 0 10px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="btn-ghost" onClick={onBack}>{backLabel}</button>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {planTitle || 'Untitled plan'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveError && <span style={{ fontSize: 12, color: 'var(--warn)' }} title={saveError}>⚠ not saved</span>}
          <ThemeToggle />
          {diagram && (
            <button className={`btn-ghost${showDiagram ? ' active' : ''}`} onClick={() => setShowDiagram(s => !s)}>
              🗺 Diagram
            </button>
          )}
          <button className={`btn-ghost${view === 'focus' ? ' active' : ''}`} onClick={() => setView('focus')}>Focus</button>
          <button className={`btn-ghost${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
          <button className="btn-primary" disabled={done.size === 0} onClick={onShip}>
            Ship ({done.size}) →
          </button>
        </div>
      </header>

      {diagram && showDiagram && (
        <DiagramPanel source={diagram} highlightNodes={active != null ? taskNodes[active] ?? [] : []} />
      )}

      {view === 'focus' ? (
        <CardViewer tasks={tasks} done={done} setDone={setDone} onShip={onShip} onTopChange={setFocusTop} />
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
            onSelect={diagram ? () => { setSelected(i); setShowDiagram(true) } : undefined}
          />
        ))}
      </>)}
    </div>
  )
}
