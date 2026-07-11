import { z } from 'zod'
import { taskSchema } from './projects.schema.ts'

export const createIssuesSchema = {
  body: z.object({
    teamId: z.string().min(1, 'teamId is required'),
    tasks: z.array(taskSchema).min(1, 'at least one task is required'),
  }),
}
