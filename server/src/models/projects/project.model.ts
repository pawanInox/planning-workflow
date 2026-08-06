import mongoose, { Schema } from 'mongoose'
import type { Project } from '../entities.ts'

const projectSchema = new Schema(
  {
    title: { type: String, required: true },
    diagram: { type: String },
    sequenceDiagram: { type: String },
    // the spec lives in its own collection (`models/specs/spec.model.ts`) — see `SpecModel`
  },
  { timestamps: true },
)

export const ProjectModel = mongoose.model('Project', projectSchema)

export const toProject = (d: any): Project => ({
  id: d._id.toString(), title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt,
  ...(d.diagram ? { diagram: d.diagram } : {}),
  ...(d.sequenceDiagram ? { sequenceDiagram: d.sequenceDiagram } : {}),
})
