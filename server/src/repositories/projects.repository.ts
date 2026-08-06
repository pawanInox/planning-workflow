import type { NewProject, ProjectPatch, ProjectRepository, ProjectSummary, ProjectWithTasks } from './ports.ts'
import { oid } from '../config/db.ts'
import { ProjectModel, toProject } from '../models/projects/project.model.ts'
import { SpecModel, toSpec } from '../models/specs/spec.model.ts'
import { TaskModel, toTask } from '../models/tasks/task.model.ts'

export class MongooseProjectRepository implements ProjectRepository {
  async create({ title, tasks, diagram, sequenceDiagram, spec }: NewProject): Promise<ProjectWithTasks> {
    const p = await ProjectModel.create({
      title,
      ...(diagram !== undefined ? { diagram } : {}),
      ...(sequenceDiagram !== undefined ? { sequenceDiagram } : {}),
    })
    // no transactions on standalone Mongo, so compensate by hand: a failed task OR spec insert must
    // not leave a half-made project sitting in the list. A 201 handing back a review link to a
    // project whose Spec tab silently never appears is worse than a 500 the caller can retry.
    try {
      const docs = tasks.length
        ? await TaskModel.insertMany(tasks.map((t, i) => ({ ...t, projectId: p._id, order: i })))
        : []
      const specDoc = spec !== undefined ? await SpecModel.create({ projectId: p._id, sections: spec }) : null
      const saved = toSpec(specDoc)
      return { ...toProject(p), ...(saved ? { spec: saved } : {}), tasks: docs.map(toTask) }
    } catch (e) {
      // children first, project last — the same order `delete` uses, for the same reason
      await SpecModel.deleteOne({ projectId: p._id }).catch(() => {})
      await TaskModel.deleteMany({ projectId: p._id }).catch(() => {})
      await ProjectModel.findByIdAndDelete(p._id).catch(() => {})
      throw e
    }
  }

  // ponytail: 2 count queries per project ON THE PAGE — bounded by `limit` now, so the old N+1
  // over the whole collection is gone; switch to one aggregate only if a page gets large
  async list({ page, limit }: { page: number; limit: number }): Promise<{ items: ProjectSummary[]; total: number }> {
    const total = await ProjectModel.countDocuments()
    const projects = await ProjectModel.find()
      // the list controller serializes only id, title, the two counts and updatedAt — both mermaid
      // sources would be transferred and thrown away. getById keeps them; the review screen needs them.
      .select('-diagram -sequenceDiagram')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
    const items = await Promise.all(projects.map(async p => ({
      project: toProject(p),
      taskCount: await TaskModel.countDocuments({ projectId: p._id }),
      doneCount: await TaskModel.countDocuments({ projectId: p._id, done: true }),
    })))
    return { items, total }
  }

  async getById(id: string): Promise<ProjectWithTasks | null> {
    const _id = oid(id)
    if (!_id) return null
    const p = await ProjectModel.findById(_id).lean()
    if (!p) return null
    const spec = toSpec(await SpecModel.findOne({ projectId: _id }).lean())
    const tasks = await TaskModel.find({ projectId: _id }).sort({ order: 1 }).lean()
    // spec merged back in here, so the wire shape is identical to when it lived on the project doc
    return { ...toProject(p), ...(spec ? { spec } : {}), tasks: tasks.map(toTask) }
  }

  async update(id: string, { title, tasks, diagram, sequenceDiagram, spec }: ProjectPatch): Promise<ProjectWithTasks | null> {
    const _id = oid(id)
    if (!_id) return null
    const patch = {
      ...(title !== undefined ? { title } : {}),
      ...(diagram !== undefined ? { diagram } : {}),
      ...(sequenceDiagram !== undefined ? { sequenceDiagram } : {}),
    }
    const p = await ProjectModel.findByIdAndUpdate(_id, patch, { new: true })
    if (!p) return null
    // one atomic write; upsert covers a project that had no spec until now
    if (spec !== undefined) {
      await SpecModel.replaceOne({ projectId: _id }, { projectId: _id, sections: spec }, { upsert: true })
    }
    if (tasks !== undefined) {
      // Replacing tasks is delete-then-insert with no transaction available, so keep the old
      // documents in hand and put them back if the insert fails. Otherwise a Mongo blip between
      // the two steps destroys the entire plan, unrecoverably.
      const previous = await TaskModel.find({ projectId: _id }).sort({ order: 1 }).lean()
      await TaskModel.deleteMany({ projectId: _id })
      try {
        if (tasks.length) await TaskModel.insertMany(tasks.map((t, i) => ({ ...t, projectId: _id, order: i })))
      } catch (e) {
        await TaskModel.insertMany(previous.map(({ _id: _drop, ...t }) => t)).catch(() => {})
        throw e
      }
    }
    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const _id = oid(id)
    if (!_id) return false
    const exists = await ProjectModel.findById(_id).select('_id').lean()
    if (!exists) return false
    // children first: if this fails the project survives, so the delete is visible and retryable.
    // The other order orphans tasks and the spec with no owning project to ever reach them again.
    await SpecModel.deleteOne({ projectId: _id })
    await TaskModel.deleteMany({ projectId: _id })
    await ProjectModel.findByIdAndDelete(_id)
    return true
  }
}
