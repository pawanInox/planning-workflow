try { process.loadEnvFile() } catch { /* no .env yet */ }

export const config = {
  port: Number(process.env.PORT) || 3001,
  mongoUri: process.env.MONGODB_URI ?? '',
  linearApiKey: process.env.LINEAR_API_KEY ?? '',
  giphyApiKey: process.env.GIPHY_API_KEY ?? '',
}
