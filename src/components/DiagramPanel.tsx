import { useEffect, useRef, useState } from 'react'

// loaded on first panel open only — keeps mermaid (~1.5MB) out of the main bundle
let mermaidP: Promise<typeof import('mermaid')['default']> | null = null
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default).catch(e => {
  mermaidP = null // never cache a rejection, or every later render silently does nothing
  throw e
}))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// one-shot guard so a stale-chunk reload can never loop
const STALE_CHUNK = 'diagram-chunk-reloaded'

// sequence diagrams have no classDef/class — highlight the rendered SVG instead. The task's
// participants (diagramNodes) get tinted boxes, and every message whose BOTH endpoints belong to
// the task lights up while the rest of the diagram dims — so the task's segment of the flow pops.
function highlightActors(root: HTMLElement, source: string, ids: string[]) {
  const labels = new Map<string, string>()
  for (const m of source.matchAll(/^\s*(?:participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+?))?\s*$/gm))
    labels.set(m[1], (m[2] ?? m[1]).trim())
  const wanted = new Set(ids.map(id => labels.get(id) ?? id))

  // Find the actor boxes first. A task can carry node ids that exist in the flowchart and appear
  // in a message label here without ever being declared a `participant` — then nothing matches,
  // and dimming "the rest" would grey out the entire diagram with nothing highlighted. Leave it
  // untouched instead, which reads as "this task maps to no lifeline".
  const boxes: { text: SVGTextElement; rect: SVGRectElement; match: boolean }[] = []
  root.querySelectorAll('text').forEach(t => {
    const rect = t.previousElementSibling as SVGRectElement | null
    if (rect?.tagName.toLowerCase() !== 'rect') return
    boxes.push({ text: t as unknown as SVGTextElement, rect, match: wanted.has(t.textContent?.trim() ?? '') })
  })
  if (!boxes.some(b => b.match)) return

  const hotX: number[] = []
  for (const { text, rect, match } of boxes) {
    if (match) {
      rect.setAttribute('stroke', '#7c5cff')
      rect.setAttribute('stroke-width', '3')
      rect.setAttribute('fill', '#7c5cff33')
      hotX.push(parseFloat(rect.getAttribute('x') ?? '0') + parseFloat(rect.getAttribute('width') ?? '0') / 2)
    } else {
      rect.setAttribute('opacity', '0.35')
      text.setAttribute('opacity', '0.35')
    }
  }
  // message lines start/end a few px off the lifeline center (activation margin) — 12px is well
  // under the ~110px minimum gap between adjacent lifelines
  const hot = (v: number) => hotX.some(x => Math.abs(x - v) < 12)

  // messages: bright purple when both endpoints sit on the task's lifelines, dimmed otherwise
  const lines = [...root.querySelectorAll('line')].filter(l => (l.getAttribute('class') ?? '').includes('messageLine'))
  const texts = [...root.querySelectorAll('text.messageText')]
  lines.forEach((l, i) => {
    const active = hot(parseFloat(l.getAttribute('x1') ?? '-1')) && hot(parseFloat(l.getAttribute('x2') ?? '-1'))
    const label = texts.length === lines.length ? texts[i] : null
    if (active) {
      l.setAttribute('stroke', '#7c5cff')
      l.setAttribute('stroke-width', '2.5')
      label?.setAttribute('fill', '#7c5cff')
      label?.setAttribute('font-weight', '700')
    } else {
      l.setAttribute('opacity', '0.22')
      label?.setAttribute('opacity', '0.22')
    }
  })
}

export function DiagramPanel({ source, highlightNodes = [] }: {
  source: string
  highlightNodes?: string[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const zoomLevel = useRef(1) // mirror of `zoom` readable from the render effect without re-rendering mermaid

  // zoom = widen the svg past its fit width; .diagram-col's overflow:auto provides the panning
  const applyZoom = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const z = zoomLevel.current
    svg.style.maxWidth = z === 1 ? '100%' : 'none'
    svg.style.width = z === 1 ? '' : `${z * 100}%`
  }
  useEffect(() => { zoomLevel.current = zoom; applyZoom() }, [zoom])

  // drag-to-pan while zoomed: the card scrolls on both axes, so panning just moves its scroll offset
  const cardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1 || (e.target as Element).closest('button')) return
    const card = cardRef.current
    if (!card) return
    drag.current = { x: e.clientX, y: e.clientY, sl: card.scrollLeft, st: card.scrollTop }
    card.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const card = cardRef.current
    if (!drag.current || !card) return
    card.scrollLeft = drag.current.sl - (e.clientX - drag.current.x)
    card.scrollTop = drag.current.st - (e.clientY - drag.current.y)
  }
  const endDrag = () => { drag.current = null }

  // trackpad ZOOM only on pinch (mac pinch = ctrlKey wheel event). A plain two-finger swipe is a
  // pan gesture — leave it to native scroll (card scrolls x, .diagram-col scrolls y) so the user
  // can move around a zoomed diagram without it zooming. Native listener because React's onWheel
  // is passive (preventDefault would be ignored).
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // plain wheel / two-finger swipe → pan, don't zoom
      // pinch over the diagram is always ours — swallow it even at min/max so the browser
      // never page-zooms the whole site
      e.preventDefault()
      const next = Math.min(4, Math.max(1, +(zoomLevel.current * Math.exp(-e.deltaY * 0.01)).toFixed(3)))
      if (next !== zoomLevel.current) setZoom(next)
    }
    card.addEventListener('wheel', onWheel, { passive: false })
    return () => card.removeEventListener('wheel', onWheel)
  }, [])

  // The touch equivalent of the trackpad pinch above. Without it, pinching the diagram on a phone
  // zooms the whole PAGE, which is never what you want on a panel that has its own zoom. Scale is
  // measured against the spread at the START of the gesture so it tracks the fingers instead of
  // drifting. `touch-action` in theme.css stops the browser claiming the gesture first.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    let from = 0
    let fromZoom = 1
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault() // claim the gesture up front, before the browser starts a page zoom with it
      from = spread(e.touches)
      fromZoom = zoomLevel.current
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !from) return
      e.preventDefault() // ours even at the limits, so the page never zooms instead
      const next = Math.min(4, Math.max(1, +(fromZoom * (spread(e.touches) / from)).toFixed(3)))
      if (next !== zoomLevel.current) setZoom(next)
    }
    const onEnd = () => { from = 0 }
    // Safari (iOS and mac) drives page pinch-zoom from its own non-standard gesture events, which
    // `touch-action` does not gate — without swallowing these, pinching the panel still scales the
    // whole site there. `scale` is relative to the gesture start, same as `spread / from` above.
    let gestureZoom = 1
    const onGestureStart = (e: any) => { e.preventDefault(); gestureZoom = zoomLevel.current }
    const onGestureChange = (e: any) => {
      e.preventDefault()
      const next = Math.min(4, Math.max(1, +(gestureZoom * e.scale).toFixed(3)))
      if (next !== zoomLevel.current) setZoom(next)
    }
    card.addEventListener('touchstart', onStart, { passive: false })
    card.addEventListener('touchmove', onMove, { passive: false })
    card.addEventListener('touchend', onEnd)
    card.addEventListener('touchcancel', onEnd)
    card.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false })
    card.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false })
    return () => {
      card.removeEventListener('touchstart', onStart)
      card.removeEventListener('touchmove', onMove)
      card.removeEventListener('touchend', onEnd)
      card.removeEventListener('touchcancel', onEnd)
      card.removeEventListener('gesturestart', onGestureStart as EventListener)
      card.removeEventListener('gesturechange', onGestureChange as EventListener)
    }
  }, [])

  // only highlight ids present in the source — a mermaid `class` line CREATES unknown ids as stray nodes
  const ids = highlightNodes.filter(id => new RegExp(`\\b${escapeRe(id)}\\b`).test(source))
  // classDef/class are flowchart-only syntax; a sequenceDiagram gets its highlight post-render
  const isFlowchart = /^\s*(graph|flowchart)\b/.test(source.trimStart())
  const src = isFlowchart && ids.length
    ? `${source}\nclassDef current fill:#7c5cff33,stroke:#7c5cff,stroke-width:3px\nclass ${ids.join(',')} current`
    : source

  useEffect(() => {
    const n = ++seq.current
    // one handler for BOTH failure sources: mermaid's lazy import rejecting, and render throwing.
    // Previously only render was covered, so a failed import left a blank panel and no message.
    const fail = (e: any) => {
      document.getElementById(`diagram-${n}`)?.remove() // mermaid leaves a temp element behind on parse errors
      const msg = String(e?.message ?? e)
      // Mermaid loads each diagram type as its own lazy chunk, so a tab left open across a
      // redeploy asks for a hashed file that no longer exists. That is a stale page, not a bad
      // diagram — reload once to pick up the new build. Browsers word this differently
      // ("Failed to fetch…" / "error loading…"), so match only the part they agree on. The flag
      // is never cleared, so this can reload at most once per session and cannot loop.
      if (/dynamically imported module/i.test(msg)) {
        if (!sessionStorage.getItem(STALE_CHUNK)) {
          sessionStorage.setItem(STALE_CHUNK, '1')
          location.reload()
          return
        }
        if (seq.current === n) setError('the app was updated in the background — reload the page to view this diagram')
        return
      }
      if (seq.current === n) setError(msg)
    }
    loadMermaid().then(async mermaid => {
      // ponytail: theme read at render time — toggling the app theme mid-view keeps the old diagram theme until the next highlight change
      const dark = document.documentElement.dataset.theme === 'dark'
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' })
      const { svg } = await mermaid.render(`diagram-${n}`, src)
      if (seq.current === n && ref.current) {
        ref.current.innerHTML = svg
        if (!isFlowchart && ids.length) highlightActors(ref.current, source, ids)
        applyZoom()
        setError('')
      }
    }).catch(fail)
  }, [src, ids.join(',')]) // ids matter on their own for sequence diagrams, where src never embeds them

  const zoomBtn: React.CSSProperties = { height: 26, padding: '0 10px', fontSize: 13, lineHeight: 1 }
  return (
    <div className="dpanel">
      <div
        ref={cardRef}
        className="card"
        style={{
          overflowX: 'auto',
          cursor: zoom > 1 ? 'grab' : undefined,
          userSelect: zoom > 1 ? 'none' : undefined,
          touchAction: zoom > 1 ? 'none' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {error && <div style={{ fontSize: 13, color: 'var(--warn)' }}>⚠ Diagram failed to render: {error}</div>}
        <div ref={ref} style={{ display: error ? 'none' : undefined, textAlign: 'center' }} />
      </div>
      {/* pinned OUTSIDE the scroller so zooming, panning, and the appearing "fit" never move the buttons */}
      <div style={{
        position: 'absolute', top: 8, left: 8, zIndex: 5, display: 'flex', gap: 4, alignItems: 'center',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 6px',
      }}>
        <button className="btn-ghost" style={zoomBtn} title="Zoom out" disabled={zoom <= 1}
          onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}>−</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost" style={zoomBtn} title="Zoom in" disabled={zoom >= 4}
          onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}>+</button>
        <button className="btn-ghost" style={{ ...zoomBtn, visibility: zoom === 1 ? 'hidden' : undefined }}
          title="Fit to panel" onClick={() => setZoom(1)}>fit</button>
      </div>
    </div>
  )
}
