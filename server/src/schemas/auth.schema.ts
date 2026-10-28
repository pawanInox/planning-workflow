import { z } from 'zod'

export const createTokenSchema = {
  body: z.object({ name: z.string().trim().min(1, 'give the token a name').max(60, 'at most 60 characters') }),
}
