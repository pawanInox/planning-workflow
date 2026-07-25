import { LinearClient, LinearDocument } from '@linear/sdk'
import { resolveDepIndex, taskToDescription, type Task } from '../../../../shared/parse.ts'
import { ServiceUnavailableError } from '../errors.ts'

export function makeLinearService(apiKey: string) {
  const linear = apiKey ? new LinearClient({ apiKey }) : null
  const requireClient = () => {
    if (!linear) throw new ServiceUnavailableError('LINEAR_API_KEY not set — copy .env.example to .env')
    return linear
  }

  return {
    async listTeams() {
      const teams = await requireClient().teams()
      return teams.nodes.map(t => ({ id: t.id, name: t.name, key: t.key }))
    },

    async createIssues(teamId: string, tasks: Task[]) {
      const client = requireClient()
      const created: { title: string; url: string }[] = []
      const createErrors: string[] = []
      // parallel to `tasks`, so a dep resolves to an issue id via its task index
      const issueIds: (string | undefined)[] = []
      // Serial on purpose: Linear numbers issues in creation order, and the plan's order is
      // meaningful. But a failure partway must NOT discard the issues already created — throwing
      // here would leave them in Linear unreported, so the user re-ships and gets duplicates.
      for (const t of tasks) {
        try {
          const payload = await client.createIssue({ teamId, title: t.title, description: taskToDescription(t) })
          const issue = await payload.issue
          created.push({ title: t.title, url: issue?.url ?? '' })
          issueIds.push(issue?.id)
        } catch (e: any) {
          createErrors.push(`"${t.title}": ${e?.message ?? e}`)
          issueIds.push(undefined) // keep the array aligned with `tasks` for dep resolution
        }
      }

      // Every issue exists by now, so the relations are independent of each other — send them
      // together. Serially this is one round-trip per dependency edge, seconds of dead time on
      // the ship click. (The createIssue loop above stays serial: Linear numbers issues in
      // creation order, and the plan's order is meaningful.)
      const relations = tasks.flatMap((t, i) => {
        const blockedId = issueIds[i]
        return (t.dependsOn ?? []).flatMap(dep => {
          const blockerId = issueIds[resolveDepIndex(tasks, dep.title)]
          if (!blockerId || !blockedId) return []
          return [{ blockerId, blockedId, label: `"${dep.title}" blocks "${t.title}"` }]
        })
      })

      // `async` so a synchronous throw from the SDK becomes a rejection allSettled can catch,
      // rather than escaping the map and failing the whole ship with every error lost
      const results = await Promise.allSettled(relations.map(async r =>
        client.createIssueRelation({ issueId: r.blockerId, relatedIssueId: r.blockedId, type: LinearDocument.IssueRelationType.Blocks })
      ))
      const relationErrors = results.flatMap((res, i) =>
        res.status === 'rejected' ? [`${relations[i].label}: ${res.reason?.message ?? res.reason}`] : []
      )

      return { created, relationErrors: [...createErrors, ...relationErrors] }
    },
  }
}

export type LinearService = ReturnType<typeof makeLinearService>
