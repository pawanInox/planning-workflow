import { useEffect, useMemo, useRef, useState } from 'react'
import { parseSeqTags } from '../../shared/seqtags'
import type { Spec } from '../lib/api'
import { SpecHoverCard, type HoverTarget } from './SpecHoverCard'
import { Icon } from './Icon'

// loaded on first panel open only — keeps mermaid (~1.5MB) out of the main bundle
let mermaidP: Promise<typeof import('mermaid')['default']> | null = null
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default).catch(e => {
  mermaidP = null // never cache a rejection, or every later render silently does nothing
  throw e
}))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Highlight colours are CSS variables: the SVG is inlined into the page, so `var(--…)` in an
// inline style resolves against the current theme and follows a theme switch without a re-render.
const HOT_LINE = 'var(--color-accent-text)'
const HOT_FILL = 'var(--color-accent-subtle)'

// the app theme as an attribute on <html>; mermaid's own theme (sequence diagrams) needs a re-render
function useThemeAttr() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

// one-shot guard so a stale-chunk reload can never loop
const STALE_CHUNK = 'diagram-chunk-reloaded'

// Flowcharts are drawn in the mockup's style, not mermaid's: its built-in <style> is dropped so
// theme.css (`.flowchart …`) is the whole look, arrowheads become open chevrons, and the task's
// nodes plus the edges BETWEEN them get an `hl` class while the rest dims via `.has-hl`.
function styleFlowchart(svg: SVGSVGElement, ids: string[]) {
  svg.querySelector(':scope > style')?.remove()
  svg.querySelectorAll('marker[id$="pointEnd"] path, marker[id$="pointStart"] path')
    .forEach(p => p.setAttribute('d', 'M1,1 L9,5 L1,9'))
  if (!ids.length) return
  const want = new Set(ids)
  let any = false
  svg.querySelectorAll<SVGGElement>('g.node').forEach(g => {
    // mermaid ids nodes as `<renderId>-flowchart-<nodeId>-<n>`
    const id = g.id.match(/-flowchart-(.+)-\d+$/)?.[1]
    if (id && want.has(id)) { g.classList.add('hl'); any = true }
  })
  // same guard as highlightActors: ids that match no node would grey out everything with nothing lit
  if (!any) return
  svg.classList.add('has-hl')
  // an edge's data-id is `L_<from>_<to>_<n>`; node ids may contain `_`, so test known pairs, never split
  const hotEdge = (dataId: string | null) => !!dataId && ids.some(a => ids.some(b => new RegExp(`^L_${escapeRe(a)}_${escapeRe(b)}_\\d+$`).test(dataId)))
  const end = svg.querySelector<SVGMarkerElement>('marker[id$="pointEnd"]')
  const hotEnd = end?.cloneNode(true) as SVGMarkerElement | undefined
  if (end && hotEnd) { hotEnd.id = `${end.id}-hl`; hotEnd.classList.add('hl'); end.after(hotEnd) }
  svg.querySelectorAll('path.flowchart-link').forEach(p => {
    if (!hotEdge(p.getAttribute('data-id'))) return
    p.classList.add('hl')
    if (hotEnd && p.getAttribute('marker-end')?.includes('pointEnd')) p.setAttribute('marker-end', `url(#${hotEnd.id})`)
  })
  svg.querySelectorAll('g.edgeLabel').forEach(g => {
    if (hotEdge(g.querySelector('g.label')?.getAttribute('data-id') ?? null)) g.classList.add('hl')
  })
}

// Mermaid draws a self-message (`a->>a`) as a <path> and every other message as a <line>. Collecting
// lines alone drops self-messages and silently misaligns any index-based pairing (labels, tags).
const messageEls = (root: HTMLElement) =>
  [...root.querySelectorAll<SVGGraphicsElement>('line, path')]
    .filter(el => (el.getAttribute('class') ?? '').includes('messageLine'))

// a <path> has no x1/x2, so it reads as NaN, which no lifeline matches — "not active", never a throw
const lineX = (el: Element, attr: 'x1' | 'x2') =>
  el.tagName.toLowerCase() === 'line' ? parseFloat(el.getAttribute(attr) ?? '') : NaN

// The i-th `text.messageText` is the i-th message's label — trusted only when the counts agree.
const messageLabels = (root: HTMLElement, messages: Element[]) => {
  const texts = [...root.querySelectorAll<SVGTextElement>('text.messageText')]
  return texts.length === messages.length ? texts : null
}

/**
 * Makes each tagged message hoverable: a fat transparent clone of the arrow as the hit target, and a
 * dotted underline + help cursor on its label (theme.css `.seq-hit` / `.seq-tagged`) so live arrows
 * can be spotted without sweeping the diagram. Pairs `tags[i]` with the i-th message element, so it
 * does nothing at all when the counts differ — a contract shown on the wrong arrow is worse than
 * none. Deliberately independent of the task highlight: a dimmed arrow keeps its tooltip.
 */
function decorateMessages(root: HTMLElement, tags: (string | null)[], onEnter: (target: HoverTarget) => void, onLeave: () => void) {
  const els = messageEls(root)
  if (els.length !== tags.length) return
  const labels = messageLabels(root, els)
  // ponytail: mouse and pen only — a tap fires pointerenter+pointerleave back to back, which would
  // just flash the card; touch already belongs to the panel's pinch-zoom and drag-to-pan
  const hover = (el: Element, id: string) => {
    el.addEventListener('pointerenter', e => { if ((e as PointerEvent).pointerType !== 'touch') onEnter({ id, rect: el.getBoundingClientRect() }) })
    el.addEventListener('pointerleave', onLeave)
  }
  els.forEach((el, i) => {
    const id = tags[i]
    if (!id) return
    const hit = el.cloneNode(false) as SVGGraphicsElement
    // keep only the geometry: no messageLine class (nothing that counts messages may count this), no
    // markers, no data-* duplicates, and no inline style — mermaid puts a dash pattern there for
    // dotted arrows, and dash gaps are not hit-testable under pointer-events: stroke
    for (const a of [...hit.attributes]) if (!/^(x1|y1|x2|y2|d)$/.test(a.name)) hit.removeAttribute(a.name)
    hit.setAttribute('class', 'seq-hit')
    el.after(hit)
    hover(hit, id)
    const label = labels?.[i]
    if (!label) return
    label.classList.add('seq-tagged')
    hover(label, id)
  })
}

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
      // style, not attributes: presentation attributes cannot take var()
      rect.style.stroke = HOT_LINE
      rect.style.strokeWidth = '1.5px'
      rect.style.fill = HOT_FILL
      hotX.push(parseFloat(rect.getAttribute('x') ?? '0') + parseFloat(rect.getAttribute('width') ?? '0') / 2)
    } else {
      rect.setAttribute('opacity', '0.35')
      text.setAttribute('opacity', '0.35')
    }
  }
  // message lines start/end a few px off the lifeline center (activation margin) — 12px is well
  // under the ~110px minimum gap between adjacent lifelines
  const hot = (v: number) => hotX.some(x => Math.abs(x - v) < 12)

  // messages: accent when both endpoints sit on the task's lifelines, dimmed otherwise
  const lines = messageEls(root)
  const msgLabels = messageLabels(root, lines)
  lines.forEach((l, i) => {
    const active = hot(lineX(l, 'x1')) && hot(lineX(l, 'x2'))
    const label = msgLabels?.[i]
    if (active) {
      l.style.stroke = HOT_LINE
      l.style.strokeWidth = '1.75px'
      if (label) label.style.fill = HOT_LINE
      label?.setAttribute('font-weight', '600')
    } else {
      l.setAttribute('opacity', '0.22')
      label?.setAttribute('opacity', '0.22')
    }
  })
}

export function DiagramPanel({ source, highlightNodes = [], spec = null }: {
  source: string
  highlightNodes?: string[]
  /** looked up by the `[specEntryId]` tags on sequence messages */
  spec?: Spec | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const zoomLevel = useRef(1) // mirror of `zoom` readable from the render effect without re-rendering mermaid
  const theme = useThemeAttr()

  // the tagged arrow (or its card) under the pointer; leaving either closes it after 120ms, which is
  // long enough to cross the gap from arrow to card so the card's scrollbar stays reachable.
  // (mouse and pen only — see decorateMessages)
  const [open, setOpen] = useState<HoverTarget | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const keepOpen = () => clearTimeout(closeTimer.current)
  const showEntry = (target: HoverTarget) => { keepOpen(); setOpen(target) }
  const closeSoon = () => { keepOpen(); closeTimer.current = setTimeout(() => setOpen(null), 120) }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  // Escape dismisses the card (WCAG 1.4.13: content shown on hover can be dismissed without moving)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // zoom = widen the svg past its fit width; .vp-scroll's overflow:auto provides the panning
  const applyZoom = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const z = zoomLevel.current
    svg.style.maxWidth = z === 1 ? '100%' : 'none'
    svg.style.width = z === 1 ? '' : `${z * 100}%`
  }
  // zooming resizes the SVG under a fixed-position card, so the card would point at the old spot
  useEffect(() => { zoomLevel.current = zoom; applyZoom(); setOpen(null) }, [zoom])

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
  // pan gesture — leave it to native scroll (.vp-scroll scrolls both axes) so the user
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
  // drifting. `touch-action` on .vp-scroll.pannable stops the browser claiming the gesture first.
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

  // only highlight ids present in the source — anything else names no node or lifeline here
  const ids = highlightNodes.filter(id => new RegExp(`\\b${escapeRe(id)}\\b`).test(source))
  const isFlowchart = /^\s*(graph|flowchart)\b/.test(source.trimStart())
  // sequence messages may carry a trailing `[specEntryId]`; mermaid gets the label without it, and
  // `tags` keeps each tag at its message's index for pairing with the rendered arrows
  const tagged = useMemo(() => (isFlowchart ? { source, tags: [] } : parseSeqTags(source)), [source, isFlowchart])

  useEffect(() => {
    const n = ++seq.current
    // this run replaces the whole SVG (source, highlight or theme changed), so a card still open
    // would point at a destroyed arrow
    keepOpen(); setOpen(null)
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
      // mermaid sizes every box from measured text, so it must measure in the app's own face and
      // size — after the web font has loaded — or theme.css's labels would not fit their boxes
      await document.fonts?.ready
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim()
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: theme === 'dark' ? 'dark' : 'neutral',
        fontFamily,
        themeVariables: { fontFamily, fontSize: '12.5px' },
        flowchart: { padding: 14, nodeSpacing: 40, rankSpacing: 48, curve: 'linear' },
      })
      const { svg } = await mermaid.render(`diagram-${n}`, tagged.source)
      if (seq.current === n && ref.current) {
        ref.current.innerHTML = svg
        const el = ref.current.querySelector('svg')
        if (isFlowchart && el) styleFlowchart(el, ids)
        // the raw source still names the participants highlightActors reads
        else if (ids.length) highlightActors(ref.current, source, ids)
        if (!isFlowchart) decorateMessages(ref.current, tagged.tags, showEntry, closeSoon)
        applyZoom()
        setError('')
      }
    }).catch(fail)
  }, [source, ids.join(','), theme]) // `tagged` derives from `source`

  return (
    <div className="vp">
      <div
        ref={cardRef}
        className={`vp-scroll${zoom > 1 ? ' pannable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onScroll={() => setOpen(null)} // the arrow moved out from under a fixed-position card
      >
        {error && <div className="vp-err" role="alert">Diagram failed to render: {error}</div>}
        <div ref={ref} style={{ display: error ? 'none' : undefined }} />
      </div>
      {/* pinned OUTSIDE the scroller so zooming and panning never move the buttons */}
      <div className="zoom">
        <button className="btn btn-ghost sq" aria-label="Zoom out" disabled={zoom <= 1}
          onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}><Icon name="minus" /></button>
        <span className="num">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-ghost sq" aria-label="Zoom in" disabled={zoom >= 4}
          onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}><Icon name="plus" /></button>
        <button className="btn btn-ghost sq" aria-label="Fit to panel" disabled={zoom === 1} onClick={() => setZoom(1)}><Icon name="fit" /></button>
      </div>
      <SpecHoverCard spec={spec} open={open} onPointerEnter={keepOpen} onPointerLeave={closeSoon} />
    </div>
  )
}
