try { process.loadEnvFile() } catch { /* no .env yet */ }

export const config = {
  port: Number(process.env.PORT) || 3001,
  mongoUri: process.env.MONGODB_URI ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  /** the origin the browser uses (e.g. http://localhost:5173): builds the OAuth redirect URI and decides the Secure cookie flag */
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5173',
}
