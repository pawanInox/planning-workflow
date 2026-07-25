import type { ProjectsPage as ProjectsPageData, ProjectSummary } from '../lib/api'
import { ThemeToggle } from '../components/ThemeToggle'

export function ProjectsPage({ page, error, onOpen, onDelete, onNewPlan, onPageChange }: {
  page: ProjectsPageData | null
  error: string
  onOpen: (id: string) => void
  onDelete: (p: ProjectSummary) => void
  onNewPlan: () => void
  onPageChange: (page: number) => void
}) {
  const projects = page?.items ?? []
  const first = page ? (page.page - 1) * page.limit + 1 : 0
  const last = first + projects.length - 1
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 0 10px', borderBottom: '1px solid var(--border)',
      }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
          📁 Projects
          {page && page.total > 0 && <span className="eyebrow" style={{ marginLeft: 10 }}>{page.total} saved</span>}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
          <button className="btn-primary" onClick={onNewPlan}>+ New plan</button>
        </div>
      </header>

      {projects.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', margin: '32px 0' }}>
          No saved projects yet — paste a plan and start a review to create one.
        </p>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {projects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="btn-ghost"
                  onClick={() => onOpen(p.id)}
                  style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <span className="pill" style={{ color: 'var(--badge-text)', background: 'var(--badge-bg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {p.doneCount}/{p.taskCount} done · {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => onDelete(p)}
                  title={`Delete "${p.title}"`}
                  aria-label={`Delete ${p.title}`}
                  style={{ height: 28, fontSize: 12, padding: '0 10px', flexShrink: 0 }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {page && page.totalPages > 1 && (
        <nav aria-label="Projects pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button className="btn-ghost" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}>← Newer</button>
          {/* which rows you are looking at, not just a page number — the range is the useful part */}
          <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>{first}–{last} of {page.total}</span>
          <button className="btn-ghost" disabled={page.page >= page.totalPages} onClick={() => onPageChange(page.page + 1)}>Older →</button>
        </nav>
      )}

      {error && <div className="card" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
    </div>
  )
}
