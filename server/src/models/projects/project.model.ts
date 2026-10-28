import mongoose, { Schema } from 'mongoose'
import type { Project } from '../entities.ts'

const projectSchema = new Schema(
  {
    title: { type: String, required: true },
    // absent on projects saved before sign-in existed; scripts/assign-owner.ts fills those in
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    diagram: { type: String },
    sequenceDiagram: { type: String },
    // the spec lives in its own collection (`models/specs/spec.model.ts`) — see `SpecModel`
  },
  { timestamps: true },
)

export const ProjectModel = mongoose.model('Project', projectSchema)

export const toProject = (d: any): Project => ({
  id: d._id.toString(), title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt,
  ...(d.ownerId ? { ownerId: d.ownerId.toString() } : {}),
  ...(d.diagram ? { diagram: d.diagram } : {}),
  ...(d.sequenceDiagram ? { sequenceDiagram: d.sequenceDiagram } : {}),
})
