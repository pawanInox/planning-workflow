import type { CookieOptions, Request } from 'express'

export const SESSION_COOKIE = 'yd_session'
export const STATE_COOKIE = 'yd_oauth_state'

// Express 4 has no cookie parser built in; this is all the app reads
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      // a malformed `%` sequence (planted by a sibling subdomain, say) is just "no cookie", never a 500
      try { return decodeURIComponent(part.slice(i + 1).trim()) } catch { return undefined }
    }
  }
  return undefined
}

/** httpOnly + SameSite=Lax always; Secure only when the app is served over https. */
export const cookieOptions = (publicUrl: string, maxAgeMs: number): CookieOptions => ({
  httpOnly: true, sameSite: 'lax', path: '/', maxAge: maxAgeMs, secure: publicUrl.startsWith('https:'),
})
