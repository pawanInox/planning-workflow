import mongoose, { Schema } from 'mongoose'
import type { TaskEntity } from '../entities.ts'

const taskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    order: { type: Number, required: true },
    title: { type: String, required: true },
    problem: { type: String, required: true },
    todo: { type: String, required: true },
    outcome: { type: String, required: true },
    dependsOn: { type: [new Schema({ title: String, reason: String }, { _id: false })], default: [] },
    done: { type: Boolean, default: false },
    diagramNodes: { type: [String], default: [] },
    specRefs: { type: [String], default: [] },
  },
  { timestamps: true },
)

export const TaskModel = mongoose.model('Task', taskSchema)

export const toTask = (d: any): TaskEntity => ({
  id: d._id.toString(), projectId: d.projectId.toString(), order: d.order,
  title: d.title, problem: d.problem, todo: d.todo, outcome: d.outcome,
  dependsOn: (d.dependsOn ?? []).map((x: any) => ({ title: x.title ?? '', reason: x.reason ?? '' })),
  done: d.done,
  diagramNodes: d.diagramNodes ?? [],
  specRefs: d.specRefs ?? [], // ?? [] so documents written before specRefs existed still map
})
