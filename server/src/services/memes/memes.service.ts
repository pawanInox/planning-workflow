import { NotFoundError, ServiceUnavailableError, UpstreamError } from '../errors.ts'

export function makeMemesService(apiKey: string) {
  const cache = new Map<string, any[]>()

  return {
    async randomMeme(query: string) {
      if (!apiKey) throw new ServiceUnavailableError('GIPHY_API_KEY not set')
      const q = query.slice(0, 50)
      let hits = cache.get(q)
      if (!hits) {
        const r = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=25&rating=pg-13&lang=en`
        )
        if (!r.ok) throw new UpstreamError(`giphy responded ${r.status}`)
        hits = ((await r.json()).data ?? []) as any[]
        cache.set(q, hits)
        console.log(`giphy fetch: "${q}" -> ${hits.length} hits (cached)`)
      }
      if (!hits.length) throw new NotFoundError('no memes found')
      const hit = hits[Math.floor(Math.random() * hits.length)]
      return { url: hit.images?.fixed_height?.url, pageUrl: hit.url, title: hit.title }
    },
  }
}

export type MemesService = ReturnType<typeof makeMemesService>
