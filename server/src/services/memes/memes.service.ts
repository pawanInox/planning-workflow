import { NotFoundError, ServiceUnavailableError, UpstreamError } from '../errors.ts'

type Meme = { url: string; pageUrl: string; title: string }

export function makeMemesService(apiKey: string) {
  // only the three fields we serve — caching Giphy's raw hits would pin every image
  // variant of 25 gifs per query in memory for the life of the process
  const cache = new Map<string, Meme[]>()

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
        const raw = ((await r.json()).data ?? []) as any[]
        // drop hits with no usable image rather than caching an undefined src
        hits = raw.flatMap(h => {
          const url = h.images?.fixed_height?.url
          return url ? [{ url, pageUrl: h.url, title: h.title }] : []
        })
        // only cache a real answer — caching an empty one would 404 this query for the
        // process lifetime, even after Giphy starts responding again
        if (hits.length) {
          cache.set(q, hits)
          console.log(`giphy fetch: "${q}" -> ${hits.length} hits (cached)`)
        }
      }
      if (!hits.length) throw new NotFoundError('no memes found')
      return hits[Math.floor(Math.random() * hits.length)]
    },
  }
}

export type MemesService = ReturnType<typeof makeMemesService>
