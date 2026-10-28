import { OAuth2Client } from 'google-auth-library'
import type { GoogleAuth } from './auth.service.ts'

/** The real GoogleAuth: authorization-code flow, then a verified ID token for the profile. */
export function makeGoogleAuth({ clientId, clientSecret, publicUrl }: { clientId: string; clientSecret: string; publicUrl: string }): GoogleAuth {
  const client = new OAuth2Client(clientId, clientSecret, `${publicUrl.replace(/\/$/, '')}/api/v1/auth/google/callback`)
  return {
    authUrl: state => client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }),
    async exchangeCode(code) {
      const { tokens } = await client.getToken(code)
      if (!tokens.id_token) throw new Error('Google returned no ID token')
      const p = (await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId })).getPayload()
      if (!p?.sub || !p.email) throw new Error('Google ID token has no account id or email')
      return { sub: p.sub, email: p.email, name: p.name ?? p.email, picture: p.picture ?? null }
    },
  }
}
