import { Router } from 'express'
import type { makeMemesController } from '../../controllers/memes.controller.ts'

export function memesRoutes(controller: ReturnType<typeof makeMemesController>): Router {
  const r = Router()
  r.get('/', controller.random)
  return r
}
