import express, { Router } from 'express'
import { config } from './src/config/config.ts'
import { connectDb } from './src/config/db.ts'
import { MongooseProjectRepository } from './src/repositories/projects.repository.ts'
import { MongooseTaskRepository } from './src/repositories/tasks.repository.ts'
import { makeProjectsService } from './src/services/projects/projects.service.ts'
import { makeLinearService } from './src/services/linear/linear.service.ts'
import { makeMemesService } from './src/services/memes/memes.service.ts'
import { makeProjectsController } from './src/controllers/projects.controller.ts'
import { makeLinearController } from './src/controllers/linear.controller.ts'
import { makeMemesController } from './src/controllers/memes.controller.ts'
import { projectsRoutes } from './src/v1/routes/projects.route.ts'
import { linearRoutes } from './src/v1/routes/linear.route.ts'
import { memesRoutes } from './src/v1/routes/memes.route.ts'
import { errorHandler } from './src/middlewares/error-handler.ts'
import { NotFoundError, ServiceUnavailableError } from './src/services/errors.ts'

const app = express()
app.use(express.json({ limit: '1mb' }))

// composition root: config -> repositories -> services -> controllers -> routes
const v1 = Router()

let projectsReady = false
if (config.mongoUri) {
  try {
    await connectDb(config.mongoUri)
    const service = makeProjectsService({
      projects: new MongooseProjectRepository(),
      tasks: new MongooseTaskRepository(),
    })
    v1.use('/projects', projectsRoutes(makeProjectsController(service)))
    projectsReady = true
    console.log('mongo connected')
  } catch (e: any) {
    console.error(`mongo connection failed: ${e?.message ?? e}`)
  }
}
if (!projectsReady) {
  // hand it to errorHandler, which already maps this to a 503 in the standard envelope
  v1.use('/projects', (_req, _res, next) =>
    next(new ServiceUnavailableError('MONGODB_URI not set — copy .env.example to .env')))
}

v1.use('/', linearRoutes(makeLinearController(makeLinearService(config.linearApiKey))))
v1.use('/memes', memesRoutes(makeMemesController(makeMemesService(config.giphyApiKey))))

// anything under /api/v1 that matched no route above answers in the documented envelope —
// without this it falls through to Express's HTML "Cannot PATCH /api/v1/..." page, which any
// client unwrapping { status, message, data } chokes on
v1.use((_req, _res, next) => next(new NotFoundError('no such endpoint')))

app.use('/api/v1', v1)
app.use(errorHandler)

app.listen(config.port, () => console.log(`api on http://localhost:${config.port}`))
