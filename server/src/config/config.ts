try { process.loadEnvFile() } catch { /* no .env yet */ }

export const config = {
  port: Number(process.env.PORT) || 3001,
  mongoUri: process.env.MONGODB_URI ?? '',
}
