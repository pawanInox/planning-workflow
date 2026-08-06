import { Fragment, useEffect, useRef, useState } from 'react'
import type { Spec, SpecEntry } from '../lib/api'

// the flowchart's highlight colour — the same task lights up in both panels, so it is the same purple
const HOT = '#7c5cff'

// A hint, NOT a schema: if an entry happens to carry one of these it reads better as the block's
// heading than as a table row. Everything else — including keys this app has never heard of — is
// rendered generically below, so an entry with none of them loses nothing.
const NAME_KEYS = ['name', 'title', 'label']

const displayName = (entry: SpecEntry) => {
  const key = NAME_KEYS.find(k => typeof entry[k] === 'string' && (entry[k] as string).trim())
  return key ? { key, value: entry[key] as string } : null
}

// values are undeclared, so anything that isn't already a string gets shown as its JSON
const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 1))

export function SpecPanel({ spec, highlightIds = [] }: {
  spec: Spec
  /** `specRefs` of the focused task: those entries light up and the rest dim */
  highlightIds?: string[]
}) {
  const [raw, setRaw] = useState(false)

  // Same guard as highlightActors in DiagramPanel: a task can carry refs that name nothing in this
  // spec (the API accepts them deliberately), and dimming "the rest" would then grey out the whole
  // panel with nothing lit. No match means render plain, which reads as "this task maps to nothing".
  const wanted = new Set(highlightIds)
  const matched = Object.values(spec).flat().filter(e => wanted.has(e.id)).map(e => e.id)
  const firstMatch = matched[0]

  const firstRef = useRef<HTMLDivElement>(null)
  // a match below the fold looks exactly like no match, so bring it into the panel's viewport
  useEffect(() => {
    if (!raw) firstRef.current?.scrollIntoView({ block: 'nearest' })
  }, [firstMatch, raw])

  return (
    <div className="card spec-panel">
      {/* sticky so it stays reachable down a long spec, with an opaque backing so the sections
          scroll under it rather than through it */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'flex-end',
        background: 'var(--surface)', paddingBottom: 6,
      }}>
        <button
          className={`btn-ghost${raw ? ' active' : ''}`}
          style={{ height: 26, padding: '0 10px', fontSize: 13 }}
          title={raw ? 'Show the rendered spec' : 'Show the raw JSON'}
          onClick={() => setRaw(r => !r)}
        >
          {'{}'}
        </button>
      </div>
      {raw ? (
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(spec, null, 2)}
        </pre>
      ) : Object.entries(spec).map(([section, entries]) => (
        <section key={section} style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{section}</div>
          {entries.map(entry => {
            const named = displayName(entry)
            const rows = Object.entries(entry).filter(([k]) => k !== 'id' && k !== named?.key)
            const hot = wanted.has(entry.id)
            return (
              <div
                key={entry.id}
                ref={entry.id === firstMatch ? firstRef : undefined}
                style={{
                  border: `2px solid ${hot ? HOT : 'var(--border)'}`,
                  background: hot ? `${HOT}33` : undefined,
                  opacity: firstMatch && !hot ? 0.3 : undefined,
                  padding: '8px 10px', marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12,
                    color: 'var(--accent)', background: 'var(--badge-bg)', padding: '1px 5px',
                  }}>
                    {entry.id}
                  </code>
                  {named && <span style={{ fontSize: 13, fontWeight: 600 }}>{named.value}</span>}
                </div>
                {rows.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 10px', marginTop: 6, fontSize: 12 }}>
                    {rows.map(([k, v]) => (
                      <Fragment key={k}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{k}</span>
                        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{show(v)}</span>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
