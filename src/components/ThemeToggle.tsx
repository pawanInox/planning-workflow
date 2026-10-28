import { useEffect, useState } from 'react'
import { getTheme, setTheme, type Theme } from '../theme'
import { Icon, type IconName } from './Icon'

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' }

export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme())
  useEffect(() => { setTheme(theme) }, [])
  function cycle() {
    const next = NEXT[theme]
    setTheme(next)
    setLocal(next)
  }
  return (
    <button className="btn btn-ghost sq" onClick={cycle} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}`}>
      <Icon name={ICON[theme]} />
    </button>
  )
}
