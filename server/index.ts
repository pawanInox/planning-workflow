import express from 'express'
import { LinearClient, LinearDocument } from '@linear/sdk'
import { taskToDescription, type Task } from '../shared/parse.ts'
import { makeProjectUseCases } from './src/application/project-use-cases.ts'
import { makeProjectRouter } from './src/http/project-router.ts'
import { connectDb, MongooseProjectRepository } from './src/infrastructure/mongoose-project-repository.ts'

try { process.loadEnvFile() } catch { /* no .env yet */ }

const apiKey = process.env.LINEAR_API_KEY
const linear = apiKey ? new LinearClient({ apiKey }) : null

const app = express()
app.use(express.json({ limit: '1mb' }))

// composition root: repository -> use-cases -> router
const mongoUri = process.env.MONGODB_URI
let projectsReady = false
if (mongoUri) {
  try {
    await connectDb(mongoUri)
    app.use('/api/projects', makeProjectRouter(makeProjectUseCases(new MongooseProjectRepository())))
    projectsReady = true
    console.log('mongo connected')
  } catch (e: any) {
    console.error(`mongo connection failed: ${e?.message ?? e}`)
  }
}
if (!projectsReady) {
  app.use('/api/projects', (_req, res) =>
    res.status(503).json({ error: 'MONGODB_URI not set — copy .env.example to .env' }))
}

app.get('/api/teams', async (_req, res) => {
  if (!linear) return res.status(500).json({ error: 'LINEAR_API_KEY not set — copy .env.example to .env' })
  const teams = await linear.teams()
  res.json(teams.nodes.map(t => ({ id: t.id, name: t.name, key: t.key })))
})

app.post('/api/issues', async (req, res) => {
  if (!linear) return res.status(500).json({ error: 'LINEAR_API_KEY not set — copy .env.example to .env' })
  const { teamId, tasks } = req.body as { teamId?: string; tasks?: Task[] }
  if (typeof teamId !== 'string' || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'expected { teamId: string, tasks: Task[] }' })
  }
  const valid = tasks.every(t => [t.title, t.problem, t.todo, t.outcome].every(s => typeof s === 'string' && s.trim()))
  if (!valid) return res.status(400).json({ error: 'every task needs non-empty title, problem, todo, outcome' })

  const created = []
  const idByTitle = new Map<string, string>()
  for (const t of tasks) {
    const payload = await linear.createIssue({ teamId, title: t.title, description: taskToDescription(t) })
    const issue = await payload.issue
    created.push({ title: t.title, url: issue?.url ?? '' })
    if (issue) idByTitle.set(t.title.toLowerCase(), issue.id)
  }

  const relationErrors: string[] = []
  for (const t of tasks) {
    const blockedId = idByTitle.get(t.title.toLowerCase())
    for (const dep of t.dependsOn ?? []) {
      const blockerId = idByTitle.get(dep.title.toLowerCase())
      if (!blockerId || !blockedId) continue
      try {
        await linear.createIssueRelation({ issueId: blockerId, relatedIssueId: blockedId, type: LinearDocument.IssueRelationType.Blocks })
      } catch (e: any) {
        relationErrors.push(`"${dep.title}" blocks "${t.title}": ${e?.message ?? e}`)
      }
    }
  }

  res.json({ created, relationErrors })
})

const memeCache = new Map<string, any[]>()

app.get('/api/meme', async (req, res) => {
  const key = process.env.GIPHY_API_KEY
  if (!key) return res.status(503).json({ error: 'GIPHY_API_KEY not set' })
  const q = String(req.query.q || 'programming').slice(0, 50)
  let hits = memeCache.get(q)
  if (!hits) {
    const r = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=25&rating=pg-13&lang=en`
    )
    if (!r.ok) return res.status(502).json({ error: `giphy responded ${r.status}` })
    hits = ((await r.json()).data ?? []) as any[]
    memeCache.set(q, hits)
    console.log(`giphy fetch: "${q}" -> ${hits.length} hits (cached)`)
  }
  if (!hits.length) return res.status(404).json({ error: 'no memes found' })
  const hit = hits[Math.floor(Math.random() * hits.length)]
  res.json({ url: hit.images?.fixed_height?.url, pageUrl: hit.url, title: hit.title })
})

const port = Number(process.env.PORT) || 3001
app.listen(port, () => console.log(`api on http://localhost:${port}`))
