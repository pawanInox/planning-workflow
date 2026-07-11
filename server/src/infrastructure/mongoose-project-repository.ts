import mongoose, { Schema, Types } from 'mongoose'
import type { NewTask, Project, ProjectRepository, ProjectSummary, ProjectWithTasks, TaskEntity } from '../domain/project-repository.ts'

const projectSchema = new Schema(
  { title: { type: String, required: true } },
  { timestamps: true },
)

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
  },
  { timestamps: true },
)

export const ProjectModel = mongoose.model('Project', projectSchema)
export const TaskModel = mongoose.model('Task', taskSchema)

const toProject = (d: any): Project => ({
  id: d._id.toString(), title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt,
})
const toTask = (d: any): TaskEntity => ({
  id: d._id.toString(), projectId: d.projectId.toString(), order: d.order,
  title: d.title, problem: d.problem, todo: d.todo, outcome: d.outcome,
  dependsOn: (d.dependsOn ?? []).map((x: any) => ({ title: x.title ?? '', reason: x.reason ?? '' })),
  done: d.done,
})
const oid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null)

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

  async addTask(projectId: string, task: NewTask): Promise<TaskEntity | null> {
    const _id = oid(projectId)
    if (!_id || !(await ProjectModel.exists({ _id }))) return null
    const last = await TaskModel.findOne({ projectId: _id }).sort({ order: -1 }).lean()
    const doc = await TaskModel.create({ ...task, projectId: _id, order: (last?.order ?? -1) + 1 })
    return toTask(doc)
  }

  async updateTask(projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity | null> {
    const pid = oid(projectId), tid = oid(taskId)
    if (!pid || !tid) return null
    const doc = await TaskModel.findOneAndUpdate({ _id: tid, projectId: pid }, patch, { new: true })
    return doc ? toTask(doc) : null
  }

  async removeTask(projectId: string, taskId: string): Promise<boolean> {
    const pid = oid(projectId), tid = oid(taskId)
    if (!pid || !tid) return false
    return (await TaskModel.deleteOne({ _id: tid, projectId: pid })).deletedCount === 1
  }
}

export const connectDb = (uri: string) => mongoose.connect(uri)
