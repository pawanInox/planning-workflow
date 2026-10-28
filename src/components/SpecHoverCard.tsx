import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Spec } from '../lib/api'
import { SpecEntryCard } from './SpecEntryCard'
import { Icon } from './Icon'

const GAP = 12 // from the hovered arrow's midpoint
const MARGIN = 8 // kept clear of the viewport edge

/** a hovered tag and the viewport rect of the arrow or label it was hovered on */
export type HoverTarget = { id: string; rect: DOMRect }

/**
 * The spec entry a tagged sequence arrow names, shown beside the arrow while it is hovered.
 * Portalled to <body>: below 1180px the side pane is a drawer moved with `translate`, and a
 * transformed ancestor becomes the containing block for `position: fixed`, which would pin the card
 * to the drawer instead of the viewport.
 */
export function SpecHoverCard({ spec, open, onPointerEnter, onPointerLeave }: {
  spec: Spec | null
  open: HoverTarget | null
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // measure first (rendered hidden), then place: beside the arrow, flipped to whichever side fits
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !open) { setPos(null); return }
    const { width, height } = el.getBoundingClientRect()
    const x = open.rect.left + open.rect.width / 2
    const y = open.rect.top + open.rect.height / 2
    let left = x + GAP
    let top = y + GAP
    if (left + width > window.innerWidth - MARGIN) left = Math.max(MARGIN, x - GAP - width)
    if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, y - GAP - height)
    setPos({ left, top })
  }, [open])

  if (!open) return null
  const entry = Object.values(spec ?? {}).flat().find(e => e.id === open.id)
  return createPortal(
    <div
      ref={ref}
      className="spec-hover"
      role="tooltip"
      style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {entry ? <SpecEntryCard entry={entry} /> : (
        // the tag is invisible once stripped from the label, so a typo must be loud here
        <div className="spec-hover-miss">
          <span className="chip code warn"><Icon name="alert" />{open.id}</span>
          <span>no such spec entry</span>
        </div>
      )}
    </div>,
    document.body,
  )
}
