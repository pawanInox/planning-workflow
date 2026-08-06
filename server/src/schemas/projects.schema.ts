import { z } from 'zod'

/** `GET /projects` paging. Coerced because query params arrive as strings, and defaulted so an
 *  unparameterised request still works. `limit` is capped so one request cannot ask for everything. */
export const listProjectsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
}

const dep = z.object({
  title: z.string().default(''),
  reason: z.string().default(''),
})

/**
 * The project's spec: sections are OPEN (`dataModels`, `api`, `interfaces` are typical, not a
 * closed list) and an entry's contents are whatever the plan needed, so only the skeleton is
 * validated — a new kind of spec content must never require a schema change here.
 *
 * The one cross-entry rule: `id` is unique across the WHOLE spec, not per section. A task points
 * at an entry with a bare id (`specRefs`), so two entries sharing one make the reference ambiguous
 * whichever sections they sit in.
 */
const specSchema = z
  // looseObject: an entry keeps every key it arrived with, declared or not
  .record(z.string(), z.array(z.looseObject({ id: z.string().trim().min(1, 'a spec entry needs an id') })))
  .superRefine((spec, ctx) => {
    const seen = new Set<string>()
    for (const [section, entries] of Object.entries(spec)) {
      entries.forEach((entry, i) => {
        // path is relative — the parent object prepends `spec`, so this reads `spec.api.0.id`,
        // pointing at the REPEAT rather than at the first, legitimate, use of the id
        if (seen.has(entry.id)) {
          ctx.addIssue({ code: 'custom', path: [section, i, 'id'], message: `duplicate spec entry id '${entry.id}'` })
        }
        seen.add(entry.id)
      })
    }
  })

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'title may not be empty'),
  problem: z.string().trim().min(1, 'problem may not be empty'),
  todo: z.string().trim().min(1, 'todo may not be empty'),
  outcome: z.string().trim().min(1, 'outcome may not be empty'),
  dependsOn: z.array(dep).default([]),
  done: z.boolean().default(false),
  diagramNodes: z.array(z.string().trim().min(1)).default([]),
  specRefs: z.array(z.string().trim().min(1)).default([]),
})

export const createProjectSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'project title must be a non-empty string'),
    tasks: z.array(taskSchema).default([]),
    diagram: z.string().trim().min(1, 'diagram may not be an empty string').optional(),
    sequenceDiagram: z.string().trim().min(1, 'sequenceDiagram may not be an empty string').optional(),
    spec: specSchema.optional(),
  }),
}

export const updateProjectSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'project title must be a non-empty string').optional(),
    tasks: z.array(taskSchema).optional(),
    diagram: z.string().trim().min(1, 'diagram may not be an empty string').optional(),
    sequenceDiagram: z.string().trim().min(1, 'sequenceDiagram may not be an empty string').optional(),
    spec: specSchema.optional(),
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
    diagramNodes: z.array(z.string().trim().min(1)).optional(),
    specRefs: z.array(z.string().trim().min(1)).optional(),
  }),
}
