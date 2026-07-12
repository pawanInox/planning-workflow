import { useEffect, useRef, useState } from 'react'

// loaded on first panel open only — keeps mermaid (~1.5MB) out of the main bundle
let mermaidP: Promise<typeof import('mermaid')['default']> | null = null
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function DiagramPanel({ source, highlightNodes = [] }: {
  source: string
  highlightNodes?: string[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const [error, setError] = useState('')

  // only highlight ids present in the source — a mermaid `class` line CREATES unknown ids as stray nodes
  const ids = highlightNodes.filter(id => new RegExp(`\\b${escapeRe(id)}\\b`).test(source))
  const src = ids.length
    ? `${source}\nclassDef current fill:#7c5cff33,stroke:#7c5cff,stroke-width:3px\nclass ${ids.join(',')} current`
    : source

  useEffect(() => {
    const n = ++seq.current
    loadMermaid().then(async mermaid => {
      // ponytail: theme read at render time — toggling the app theme mid-view keeps the old diagram theme until the next highlight change
      const dark = document.documentElement.dataset.theme === 'dark'
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' })
      try {
        const { svg } = await mermaid.render(`diagram-${n}`, src)
        if (seq.current === n && ref.current) { ref.current.innerHTML = svg; setError('') }
      } catch (e: any) {
        document.getElementById(`diagram-${n}`)?.remove() // mermaid leaves a temp element behind on parse errors
        if (seq.current === n) setError(String(e?.message ?? e))
      }
    })
  }, [src])

  return (
    <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
      {error && <div style={{ fontSize: 13, color: 'var(--warn)' }}>⚠ Diagram failed to render: {error}</div>}
      <div ref={ref} style={{ display: error ? 'none' : undefined, textAlign: 'center' }} />
    </div>
  )
}
