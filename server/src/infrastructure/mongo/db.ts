import mongoose, { Types } from 'mongoose'

export const connectDb = (uri: string) => mongoose.connect(uri)

export const oid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null)
