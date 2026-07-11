import type { MemesService } from '../services/memes/memes.service.ts'
import { asyncHandler, ok } from './respond.ts'

export function makeMemesController(service: MemesService) {
  return {
    random: asyncHandler(async (req, res) => {
      ok(res, 'meme found', await service.randomMeme(String(req.query.q || 'programming')))
    }),
  }
}
