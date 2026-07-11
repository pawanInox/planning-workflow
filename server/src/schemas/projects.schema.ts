import { z } from 'zod'

const dep = z.object({
  title: z.string().default(''),
  reason: z.string().default(''),
})

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'title may not be empty'),
  problem: z.string().trim().min(1, 'problem may not be empty'),
  todo: z.string().trim().min(1, 'todo may not be empty'),
  outcome: z.string().trim().min(1, 'outcome may not be empty'),
  dependsOn: z.array(dep).default([]),
  done: z.boolean().default(false),
})

export const createProjectSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'project title must be a non-empty string'),
    tasks: z.array(taskSchema).default([]),
  }),
}

export const updateProjectSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'project title must be a non-empty string').optional(),
    tasks: z.array(taskSchema).optional(),
  }),
}

export const addTaskSchema = { body: taskSchema }

// fields optional on PATCH, text fields may not be blanked when present; no defaults —
// a `.partial()` of taskSchema would keep `.default([])` and silently wipe dependsOn on every patch
export const patchTaskSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'title may not be empty').optional(),
    problem: z.string().trim().min(1, 'problem may not be empty').optional(),
    todo: z.string().trim().min(1, 'todo may not be empty').optional(),
    outcome: z.string().trim().min(1, 'outcome may not be empty').optional(),
    dependsOn: z.array(dep).optional(),
    done: z.boolean().optional(),
  }),
}
