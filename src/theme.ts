export type Theme = 'light' | 'dark' | 'system'

const mql = window.matchMedia('(prefers-color-scheme: dark)')
let systemListener: (() => void) | null = null

export function getTheme(): Theme {
  return (localStorage.theme as Theme) || 'system'
}

function apply(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && mql.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(t: Theme) {
  localStorage.theme = t
  apply(t)
  if (systemListener) mql.removeEventListener('change', systemListener)
  systemListener = null
  if (t === 'system') {
    systemListener = () => apply('system')
    mql.addEventListener('change', systemListener)
  }
}
