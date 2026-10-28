import { useRef, useState } from 'react'
import type { ProjectsPage, ProjectSummary } from '../lib/api'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5
  if (h < 1) return 'just now'
  if (h < 24) return `${Math.round(h)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Sidebar({ page, error, activeId, activeDone, open, onClose, onHome, onNewPlan, onOpen, onDelete, onPageChange }: {
  page: ProjectsPage | null
  error: string
  activeId: string | null
  /** live approved count for the open project, so its row tracks the review before a refetch */
  activeDone: number | null
  open: boolean
  onClose: () => void
  onHome: () => void
  onNewPlan: () => void
  onOpen: (id: string) => void
  onDelete: (p: ProjectSummary) => void
  onPageChange: (page: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState<ProjectSummary | null>(null)
  const items = page?.items ?? []
  const first = page ? (page.page - 1) * page.limit + 1 : 0

  function askDelete(p: ProjectSummary) {
    setPending(p)
    // Escape closes without touching returnValue, so a stale 'ok' from the last delete would fire again
    if (dialog.current) dialog.current.returnValue = ''
    dialog.current?.showModal()
  }

  return (<>
    {open && <div className="scrim nav-scrim" onClick={onClose} />}
    <aside className={`side${open ? ' open' : ''}`} aria-label="Projects">
      <div className="side-top">
        <button className="brand" onClick={onHome} aria-label="Home">
          <span className="brand-mark"><Icon name="check" /></span>Yak Dai
        </button>
        <button className="btn btn-outline lead side-new" onClick={onNewPlan}>
          <Icon name="plus" />New plan
        </button>
      </div>
      <div className="side-label">
        <span className="eyebrow">Projects</span>
        {page && <span className="eyebrow num">{page.total}</span>}
      </div>
      <div className="side-list">
        {items.length === 0 ? (
          <p className="side-empty">{error ? 'Projects could not be loaded.' : 'No saved projects yet. Paste a plan and start a review to create one.'}</p>
        ) : items.map(p => {
          const doneCount = p.id === activeId && activeDone !== null ? activeDone : p.doneCount
          return (
            <div key={p.id} className="proj" aria-current={p.id === activeId}>
              <button className="proj-open" onClick={() => onOpen(p.id)}>
                <span className="proj-title">{p.title}</span>
                <span className="proj-meta">
                  <span className="mini-bar"><i style={{ width: `${p.taskCount ? (doneCount / p.taskCount) * 100 : 0}%` }} /></span>
                  <span className="num">{doneCount}/{p.taskCount}</span><span>·</span><span>{ago(p.updatedAt)}</span>
                </span>
              </button>
              <button className="btn btn-ghost sq sm proj-del" onClick={() => askDelete(p)} aria-label={`Delete ${p.title}`} title="Delete project">
                <Icon name="trash" />
              </button>
            </div>
          )
        })}
      </div>
      {page && page.totalPages > 1 && (
        <nav className="side-pager" aria-label="Project pages">
          <button className="btn btn-ghost sq sm" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)} aria-label="Newer projects">
            <Icon name="chev-l" />
          </button>
          {/* which rows you are looking at, not just a page number — the range is the useful part */}
          <span className="eyebrow num">{first}–{first + items.length - 1} of {page.total}</span>
          <button className="btn btn-ghost sq sm" disabled={page.page >= page.totalPages} onClick={() => onPageChange(page.page + 1)} aria-label="Older projects">
            <Icon name="chev-r" />
          </button>
        </nav>
      )}
      <div className="side-foot">
        <span className={`api-dot${error ? ' down' : ''}`} title={error || 'API and MongoDB reachable'}>
          <i />{error ? 'API unavailable' : 'API connected'}
        </span>
        <ThemeToggle />
      </div>
    </aside>
    <dialog ref={dialog} onClose={() => {
      if (dialog.current?.returnValue === 'ok' && pending) onDelete(pending)
      setPending(null)
    }}>
      <form method="dialog">
        <h3>Delete “{pending?.title}”?</h3>
        <p>This removes the project and its {pending?.taskCount} task{pending?.taskCount === 1 ? '' : 's'}. It cannot be undone.</p>
        <div className="row">
          <button className="btn btn-ghost" value="cancel" autoFocus>Cancel</button>
          <button className="btn btn-danger lead" value="ok"><Icon name="trash" />Delete</button>
        </div>
      </form>
    </dialog>
  </>)
}
