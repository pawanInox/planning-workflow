import { useEffect, useState } from 'react'
import { getTheme, setTheme, type Theme } from '../theme'

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const ICON: Record<Theme, string> = { light: '☀️', dark: '🌙', system: '💻' }

export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme())
  useEffect(() => { setTheme(theme) }, [])
  function cycle() {
    const next = NEXT[theme]
    setTheme(next)
    setLocal(next)
  }
  return (
    <button className="btn-ghost" onClick={cycle} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}`}>
      {ICON[theme]}
    </button>
  )
}
