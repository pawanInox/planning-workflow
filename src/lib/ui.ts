// Small UI helpers shared by pages and components. Server calls stay in api.ts.

/** Zero-padded 1-based task number: 0 → "01". */
export const pad = (i: number) => String(i + 1).padStart(2, '0')

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Single-key shortcuts must not fire while the user is typing or inside a modal dialog. */
export const isTypingTarget = (target: EventTarget | null) =>
  Boolean((target as Element | null)?.closest?.('input, textarea, select, [contenteditable], dialog'))

// copies, never mutations — React needs a new Set to see the change
export const toggled = <T,>(set: Set<T>, v: T) => (set.has(v) ? without(set, v) : new Set(set).add(v))
export const without = <T,>(set: Set<T>, v: T) => { const next = new Set(set); next.delete(v); return next }

/** Whether a project has anything for the side pane (flowchart, sequence diagram or spec). */
export const hasSidePane = (p: { diagram: string; seqDiagram: string; spec: unknown }) =>
  Boolean(p.diagram || p.seqDiagram || p.spec)
