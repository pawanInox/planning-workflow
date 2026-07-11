import { LinearClient, LinearDocument } from '@linear/sdk'
import { taskToDescription, type Task } from '../../../../shared/parse.ts'
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
      const idByTitle = new Map<string, string>()
      for (const t of tasks) {
        const payload = await client.createIssue({ teamId, title: t.title, description: taskToDescription(t) })
        const issue = await payload.issue
        created.push({ title: t.title, url: issue?.url ?? '' })
        if (issue) idByTitle.set(t.title.toLowerCase(), issue.id)
      }

      const relationErrors: string[] = []
      for (const t of tasks) {
        const blockedId = idByTitle.get(t.title.toLowerCase())
        for (const dep of t.dependsOn ?? []) {
          const blockerId = idByTitle.get(dep.title.toLowerCase())
          if (!blockerId || !blockedId) continue
          try {
            await client.createIssueRelation({ issueId: blockerId, relatedIssueId: blockedId, type: LinearDocument.IssueRelationType.Blocks })
          } catch (e: any) {
            relationErrors.push(`"${dep.title}" blocks "${t.title}": ${e?.message ?? e}`)
          }
        }
      }

      return { created, relationErrors }
    },
  }
}

export type LinearService = ReturnType<typeof makeLinearService>
