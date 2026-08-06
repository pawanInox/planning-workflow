import mongoose, { Schema } from 'mongoose'
import type { Spec } from '../entities.ts'

const specSchema = new Schema(
  {
    // unique: one spec per project, enforced by the database rather than by convention
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },
    // Mixed: sections are open and entry contents are undeclared, so mongoose must not impose a
    // shape on either — the API schema already guarantees the skeleton (`schemas/projects.schema.ts`).
    // Nested under `sections` rather than spread at the document root because a section may be
    // named anything, and a root-level record could collide with `_id` or `projectId`.
    sections: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

export const SpecModel = mongoose.model('Spec', specSchema)

/** Undefined for a missing doc AND for an empty one, so "no spec" has a single representation. */
export const toSpec = (d: any): Spec | undefined =>
  d?.sections && Object.keys(d.sections).length ? (d.sections as Spec) : undefined
