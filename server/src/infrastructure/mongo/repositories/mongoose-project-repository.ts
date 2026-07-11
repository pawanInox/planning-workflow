import type { NewTask, ProjectRepository, ProjectSummary, ProjectWithTasks } from '../../../domain/project-repository.ts'
import { oid } from '../db.ts'
import { ProjectModel, toProject } from '../models/project-model.ts'
import { TaskModel, toTask } from '../models/task-model.ts'

export class MongooseProjectRepository implements ProjectRepository {
  async create({ title, tasks }: { title: string; tasks: NewTask[] }): Promise<ProjectWithTasks> {
    const p = await ProjectModel.create({ title })
    const docs = tasks.length
      ? await TaskModel.insertMany(tasks.map((t, i) => ({ ...t, projectId: p._id, order: i })))
      : []
    return { ...toProject(p), tasks: docs.map(toTask) }
  }

  // ponytail: N+1 count queries per project, switch to one aggregate if lists grow
  async list(): Promise<ProjectSummary[]> {
    const projects = await ProjectModel.find().sort({ updatedAt: -1 }).lean()
    return Promise.all(projects.map(async p => ({
      project: toProject(p),
      taskCount: await TaskModel.countDocuments({ projectId: p._id }),
      doneCount: await TaskModel.countDocuments({ projectId: p._id, done: true }),
    })))
  }

  async getById(id: string): Promise<ProjectWithTasks | null> {
    const _id = oid(id)
    if (!_id) return null
    const p = await ProjectModel.findById(_id).lean()
    if (!p) return null
    const tasks = await TaskModel.find({ projectId: _id }).sort({ order: 1 }).lean()
    return { ...toProject(p), tasks: tasks.map(toTask) }
  }

  async update(id: string, { title, tasks }: { title?: string; tasks?: NewTask[] }): Promise<ProjectWithTasks | null> {
    const _id = oid(id)
    if (!_id) return null
    const p = await ProjectModel.findByIdAndUpdate(_id, title !== undefined ? { title } : {}, { new: true })
    if (!p) return null
    if (tasks !== undefined) {
      await TaskModel.deleteMany({ projectId: _id })
      if (tasks.length) await TaskModel.insertMany(tasks.map((t, i) => ({ ...t, projectId: _id, order: i })))
    }
    return this.getById(id)
  }

  async delete(id: string): Promise<boolean> {
    const _id = oid(id)
    if (!_id) return false
    const removed = await ProjectModel.findByIdAndDelete(_id)
    if (!removed) return false
    await TaskModel.deleteMany({ projectId: _id })
    return true
  }
}
