import { useEffect, useRef } from 'react'
import type { Spec } from '../lib/api'
import { SpecEntryCard } from './SpecEntryCard'
import { prefersReducedMotion } from '../lib/ui'

// `dataModels` → `data Models`; the eyebrow style uppercases it
const sectionLabel = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2')

export function SpecPanel({ spec, highlightIds = [], raw, ping }: {
  spec: Spec
  /** `specRefs` of the focused task: those entries light up and the rest dim */
  highlightIds?: string[]
  raw: boolean
  /** an entry a card chip asked to see; `n` changes on every click so repeat clicks re-scroll */
  ping: { id: string; n: number } | null
}) {
  // Same guard as highlightActors in DiagramPanel: a task can carry refs that name nothing in this
  // spec (the API accepts them deliberately), and dimming "the rest" would then grey out the whole
  // panel with nothing lit. No match means render plain, which reads as "this task maps to nothing".
  const wanted = new Set(highlightIds)
  const firstMatch = Object.values(spec).flat().find(e => wanted.has(e.id))?.id
  const root = useRef<HTMLDivElement>(null)
  const entryEl = (id: string) => root.current?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(id)}"]`)

  // a match below the fold looks exactly like no match, so bring it into the panel's viewport
  useEffect(() => {
    if (!raw && firstMatch) entryEl(firstMatch)?.scrollIntoView({ block: 'nearest' })
  }, [firstMatch, raw])

  useEffect(() => {
    if (raw || !ping) return
    const el = entryEl(ping.id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    // restart the one-shot flash even when the same entry is pinged twice
    el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping')
  }, [ping, raw])

  return (
    <div ref={root} className={`spec${firstMatch ? ' has-hl' : ''}`}>
      {raw ? (
        <div className="surface"><pre className="raw">{JSON.stringify(spec, null, 2)}</pre></div>
      ) : Object.entries(spec).map(([section, entries]) => (
        <section key={section} className="spec-sec">
          <span className="eyebrow">{sectionLabel(section)}</span>
          <div className="spec-entries">
            {entries.map(entry => <SpecEntryCard key={entry.id} entry={entry} hot={wanted.has(entry.id)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
