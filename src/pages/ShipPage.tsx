import type { Task } from '../../shared/parse'
import type { CreatedIssue, Team } from '../lib/api'
import { cardHue } from '../components/TaskCard'
import { ThemeToggle } from '../components/ThemeToggle'

export function ShipPage({ tasks, shippable, teams, teamId, setTeamId, busy, created, error, onBack, onCreate }: {
  tasks: Task[]
  shippable: Task[]
  teams: Team[]
  teamId: string
  setTeamId: (id: string) => void
  busy: boolean
  created: CreatedIssue[]
  error: string
  onBack: () => void
  onCreate: () => void
}) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 0 10px', borderBottom: '1px solid var(--border)',
      }}>
        <button className="btn-ghost" onClick={onBack}>← Back to review</button>
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
        <button className="btn-primary" onClick={onCreate} disabled={busy || !teamId || shippable.length === 0 || created.length > 0}>
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
