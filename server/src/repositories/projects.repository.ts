import type { NewTask, ProjectRepository, ProjectSummary, ProjectWithTasks } from './ports.ts'
import { oid } from '../config/db.ts'
import { ProjectModel, toProject } from '../models/projects/project.model.ts'
import { TaskModel, toTask } from '../models/tasks/task.model.ts'

export class MongooseProjectRepository implements ProjectRepository {
  async create({ title, tasks, diagram, sequenceDiagram }: { title: string; tasks: NewTask[]; diagram?: string; sequenceDiagram?: string }): Promise<ProjectWithTasks> {
    const p = await ProjectModel.create({
      title,
      ...(diagram !== undefined ? { diagram } : {}),
      ...(sequenceDiagram !== undefined ? { sequenceDiagram } : {}),
    })
    // no transactions on standalone Mongo, so compensate by hand: a failed task insert must not
    // leave a permanently empty project sitting in the list
    try {
      const docs = tasks.length
        ? await TaskModel.insertMany(tasks.map((t, i) => ({ ...t, projectId: p._id, order: i })))
        : []
      return { ...toProject(p), tasks: docs.map(toTask) }
    } catch (e) {
      await ProjectModel.findByIdAndDelete(p._id).catch(() => {})
      throw e
    }
  }

  // ponytail: 2 count queries per project ON THE PAGE — bounded by `limit` now, so the old N+1
  // over the whole collection is gone; switch to one aggregate only if a page gets large
  async list({ page, limit }: { page: number; limit: number }): Promise<{ items: ProjectSummary[]; total: number }> {
    const total = await ProjectModel.countDocuments()
    const projects = await ProjectModel.find()
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
    const tasks = await TaskModel.find({ projectId: _id }).sort({ order: 1 }).lean()
    return { ...toProject(p), tasks: tasks.map(toTask) }
  }

  async update(id: string, { title, tasks, diagram, sequenceDiagram }: { title?: string; tasks?: NewTask[]; diagram?: string; sequenceDiagram?: string }): Promise<ProjectWithTasks | null> {
    const _id = oid(id)
    if (!_id) return null
    const patch = {
      ...(title !== undefined ? { title } : {}),
      ...(diagram !== undefined ? { diagram } : {}),
      ...(sequenceDiagram !== undefined ? { sequenceDiagram } : {}),
    }
    const p = await ProjectModel.findByIdAndUpdate(_id, patch, { new: true })
    if (!p) return null
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
    // tasks first: if this fails the project survives, so the delete is visible and retryable.
    // The other order orphans tasks with no owning project to ever reach them again.
    await TaskModel.deleteMany({ projectId: _id })
    await ProjectModel.findByIdAndDelete(_id)
    return true
  }
}
