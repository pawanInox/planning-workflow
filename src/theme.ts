export type Theme = 'light' | 'dark' | 'system'

const mql = window.matchMedia('(prefers-color-scheme: dark)')
let systemListener: (() => void) | null = null

export function getTheme(): Theme {
  try { return (localStorage.theme as Theme) || 'system' } catch { return 'system' }
}

// Every colour transition would otherwise fire at once and smear the swap (better-ui): disable
// transitions, flip the attribute, force a style flush, then restore them after the next frame.
function apply(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && mql.matches)
  const kill = document.createElement('style')
  kill.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.append(kill)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  void getComputedStyle(document.body).opacity
  requestAnimationFrame(() => requestAnimationFrame(() => kill.remove()))
}

export function setTheme(t: Theme) {
  try { localStorage.theme = t } catch { /* private mode: the choice just won't persist */ }
  apply(t)
  if (systemListener) mql.removeEventListener('change', systemListener)
  systemListener = null
  if (t === 'system') {
    systemListener = () => apply('system')
    mql.addEventListener('change', systemListener)
  }
}
