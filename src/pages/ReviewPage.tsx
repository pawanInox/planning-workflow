import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Task } from '../../shared/parse'
import { TaskCard } from '../components/TaskCard'
import { CardViewer } from '../components/CardViewer'
import { ThemeToggle } from '../components/ThemeToggle'
import { DiagramPanel } from '../components/DiagramPanel'

export function ReviewPage({ planTitle, tasks, done, setDone, view, setView, saveError, backLabel, onBack, onShip, diagram, seqDiagram = '', taskNodes }: {
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
  seqDiagram?: string
  taskNodes: string[][]
}) {
  const [focusTop, setFocusTop] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  // which diagram to render when the project has both; fall back to whichever exists
  const [diagramKind, setDiagramKind] = useState<'flow' | 'seq'>('flow')
  const shownDiagram = diagramKind === 'seq' && seqDiagram ? seqDiagram : diagram || seqDiagram
  const active = view === 'focus' ? focusTop : selected
  const body = view === 'focus' ? (
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
        onSelect={shownDiagram ? () => setSelected(i) : undefined}
      />
    ))}
  </>)
  return (
    <div style={{ maxWidth: shownDiagram ? 1320 : 760, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          <button className={`btn-ghost${view === 'focus' ? ' active' : ''}`} onClick={() => setView('focus')}>Focus</button>
          <button className={`btn-ghost${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
          <button className="btn-primary" disabled={done.size === 0} onClick={onShip}>
            Ship ({done.size}) →
          </button>
        </div>
      </header>

      {diagram || seqDiagram ? (
        <div className="review-split">
          <div className="diagram-col">
            {diagram && seqDiagram && (
              <div className="diagram-toggle" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button className={`btn-ghost${diagramKind === 'flow' ? ' active' : ''}`} onClick={() => setDiagramKind('flow')}>
                  🗺 Flowchart
                </button>
                <button className={`btn-ghost${diagramKind === 'seq' ? ' active' : ''}`} onClick={() => setDiagramKind('seq')}>
                  ⇄ Sequence
                </button>
              </div>
            )}
            <DiagramPanel source={shownDiagram} highlightNodes={active != null ? taskNodes[active] ?? [] : []} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {body}
          </div>
        </div>
      ) : body}
    </div>
  )
}
