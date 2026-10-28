/**
 * One-shot upgrade step: give every project saved before sign-in existed (no `ownerId`) to one
 * account. Run by hand, once per database — deliberately NOT wired into server startup or `npm run dev`:
 *
 *   MONGODB_URI=mongodb://localhost:27019/plan-to-linear npx tsx scripts/assign-owner.ts pawan@inox.co.th
 *
 * The email must belong to someone who has signed in with Google at least once — the users row is
 * created at sign-in, keyed by Google's account id. Safe to re-run: a project that already has an
 * owner is never touched, so a second run assigns 0.
 */
import mongoose from 'mongoose'
import { connectDb } from '../server/src/config/db.ts'
import { UserModel } from '../server/src/models/users/user.model.ts'
import { ProjectModel } from '../server/src/models/projects/project.model.ts'

const uri = process.env.MONGODB_URI
const email = process.argv[2]?.trim().toLowerCase()
if (!uri) {
  console.error('MONGODB_URI is not set — nothing to assign against')
  process.exit(1)
}
if (!email) {
  console.error('usage: npx tsx scripts/assign-owner.ts <email>')
  process.exit(1)
}

await connectDb(uri)
try {
  const user = await UserModel.findOne({ email }).lean()
  if (!user) {
    console.error(`no user with email ${email} — sign in once with that Google account first`)
    process.exitCode = 1
  } else {
    // `$in: [null]` matches both a missing field and an explicit null. timestamps: false — the list
    // sorts by updatedAt, and a change of owner is not an edit; bumping it would reshuffle every project
    const { modifiedCount } = await ProjectModel.updateMany(
      { ownerId: { $in: [null] } }, { $set: { ownerId: user._id } }, { timestamps: false })
    console.log(`assigned ${modifiedCount} project${modifiedCount === 1 ? '' : 's'} to ${email}`)
  }
} finally {
  await mongoose.disconnect()
}
