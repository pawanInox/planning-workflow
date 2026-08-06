/**
 * One-shot migration: move any `spec` still sitting on a project document into the `specs`
 * collection. Run by hand, once — deliberately NOT wired into server startup or `npm run dev`:
 *
 *   MONGODB_URI=mongodb://localhost:27019/plan-to-linear npx tsx scripts/migrate-spec.ts
 *
 * Safe to re-run: a project whose spec already reached `specs` is skipped, and re-running against
 * a migrated database scans nothing.
 */
import mongoose from 'mongoose'
import { connectDb } from '../server/src/config/db.ts'
import { SpecModel } from '../server/src/models/specs/spec.model.ts'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI is not set — nothing to migrate against')
  process.exit(1)
}

await connectDb(uri)

const db = mongoose.connection.db
if (!db) {
  console.error('connected, but no database handle — check the database name in MONGODB_URI')
  process.exit(1)
}

// The RAW driver collection, not ProjectModel. `spec` is no longer declared on `projectSchema`, and
// mongoose strips undeclared fields on read — a ProjectModel query would report zero documents to
// migrate while the data is still sitting there, which is the exact failure this script exists for.
const projects = db.collection('projects')
const stranded = await projects.find({ spec: { $exists: true, $ne: null } }).toArray()

let moved = 0
let skipped = 0

for (const doc of stranded) {
  if (await SpecModel.exists({ projectId: doc._id })) {
    // a previous run inserted this one and died before unsetting — the unset below finishes the job
    skipped++
  } else {
    await SpecModel.create({ projectId: doc._id, sections: doc.spec })
    moved++
  }
  // ONLY after the spec is safely in the new collection. Dying between the insert and this unset
  // leaves the source intact, and the re-run's `exists` check above skips the insert and lands here.
  await projects.updateOne({ _id: doc._id }, { $unset: { spec: '' } })
}

console.log(`moved ${moved}, skipped ${skipped}, scanned ${stranded.length}`)
await mongoose.disconnect()
process.exit(0)
