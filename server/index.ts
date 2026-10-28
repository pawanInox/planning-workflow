import express, { Router } from 'express'
import { config } from './src/config/config.ts'
import { connectDb } from './src/config/db.ts'
import { MongooseProjectRepository } from './src/repositories/projects.repository.ts'
import { MongooseTaskRepository } from './src/repositories/tasks.repository.ts'
import { MongooseApiTokenRepository, MongooseSessionRepository, MongooseUserRepository } from './src/repositories/auth.repository.ts'
import { makeProjectsService } from './src/services/projects/projects.service.ts'
import { makeAuthService } from './src/services/auth/auth.service.ts'
import { makeGoogleAuth } from './src/services/auth/google.ts'
import { makeProjectsController } from './src/controllers/projects.controller.ts'
import { makeAuthController, signInFailed } from './src/controllers/auth.controller.ts'
import { projectsRoutes } from './src/v1/routes/projects.route.ts'
import { authRoutes } from './src/v1/routes/auth.route.ts'
import { resolveUser } from './src/middlewares/resolve-user.ts'
import { requireUser } from './src/middlewares/require-user.ts'
import { errorHandler } from './src/middlewares/error-handler.ts'
import { NotFoundError, ServiceUnavailableError } from './src/services/errors.ts'

const app = express()
app.use(express.json({ limit: '1mb' }))

// composition root: config -> repositories -> services -> controllers -> routes
const v1 = Router()

let mongoReady = false
if (config.mongoUri) {
  try {
    await connectDb(config.mongoUri)
    const users = new MongooseUserRepository()
    const google = config.googleClientId && config.googleClientSecret
      ? makeGoogleAuth({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, publicUrl: config.publicUrl })
      : null // the auth service answers 503 on sign-in until both are set
    if (!google) console.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — sign-in disabled')
    const auth = makeAuthService({ users, sessions: new MongooseSessionRepository(), tokens: new MongooseApiTokenRepository(), google })
    const projects = makeProjectsService({ projects: new MongooseProjectRepository(), tasks: new MongooseTaskRepository(), users })

    v1.use(resolveUser(auth)) // who is asking, for every route below — never rejects on its own
    v1.use('/auth', authRoutes(makeAuthController(auth, { publicUrl: config.publicUrl })))
    v1.use('/projects', requireUser, projectsRoutes(makeProjectsController(projects)))
    mongoReady = true
    console.log('mongo connected')
  } catch (e: any) {
    console.error(`mongo connection failed: ${e?.message ?? e}`)
  }
}
if (!mongoReady) {
  // a browser navigating to sign in gets the sign-in screen back, not a raw JSON 503
  v1.get('/auth/google', (req, res) => res.redirect(302, signInFailed(req.query.returnTo, 'unavailable')))
  // hand it to errorHandler, which already maps this to a 503 in the standard envelope
  v1.use(['/projects', '/auth'], (_req, _res, next) =>
    next(new ServiceUnavailableError('MONGODB_URI not set — copy .env.example to .env')))
}

// anything under /api/v1 that matched no route above answers in the documented envelope —
// without this it falls through to Express's HTML "Cannot PATCH /api/v1/..." page, which any
// client unwrapping { status, message, data } chokes on
v1.use((_req, _res, next) => next(new NotFoundError('no such endpoint')))

app.use('/api/v1', v1)
app.use(errorHandler)

app.listen(config.port, () => console.log(`api on http://localhost:${config.port}`))
