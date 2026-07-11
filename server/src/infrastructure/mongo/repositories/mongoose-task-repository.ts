import type { NewTask, TaskEntity, TaskRepository } from '../../../domain/task-repository.ts'
import { oid } from '../db.ts'
import { ProjectModel } from '../models/project-model.ts'
import { TaskModel, toTask } from '../models/task-model.ts'

export class MongooseTaskRepository implements TaskRepository {
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
