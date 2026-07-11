# plan-to-linear

Paste a markdown plan → review tasks card-by-card (Focus deck or List) → ship the done ones to Linear. Projects and tasks persist in MongoDB.

- Frontend: React + Vite (`src/`), dev server on 5173, proxies `/api` to the API.
- API: Express (`server/`), port 3001 (`PORT` env). Clean architecture: `server/src/domain` (entities + repository port) → `application` (use-cases, validation) → `infrastructure` (Mongoose) → `http` (router). `server/index.ts` is the composition root.
- Shared parser/serializer: `shared/parse.ts` (`parsePlan` ⇄ `planToMarkdown`).
- Run: `npm run dev` (needs `MONGODB_URI` in `.env` for persistence) or `docker compose up --build` (app on 5173, Mongo browsable on 27019).
- Test: `npm test` (node:test via tsx). Typecheck: `npx tsc --noEmit`.

## Project/task API

Base URL: `http://localhost:3001` with `npm run dev`. With `docker compose up`, the api container is not host-published — go through the web proxy instead: `http://localhost:5173/api/...`. If unsure which is running, try 3001 first and fall back to 5173.

Use this to read or edit a user's plan while they review it in the app — the review screen polls every 3 s and reflects external task edits automatically.

**Deep link**: `http://localhost:5173/?project=<id>` opens that project directly in review. After creating a project via `POST /api/projects`, hand the user this URL (the `/linear-plan` skill does this automatically after planning).

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/projects` | — | `[{ id, title, taskCount, doneCount, updatedAt }]` |
| `POST /api/projects` | `{ title, tasks: [Task] }` | 201, project + tasks (with ids, ordered) |
| `GET /api/projects/:id` | — | project + `tasks` sorted by `order`, each with its own `id` |
| `PUT /api/projects/:id` | `{ title?, tasks? }` | tasks value replaces ALL tasks (new ids) |
| `DELETE /api/projects/:id` | — | 204, cascades tasks |
| `POST /api/projects/:id/tasks` | `Task` | 201, appended task |
| `PATCH /api/projects/:id/tasks/:taskId` | any subset of Task fields | updated task |
| `DELETE /api/projects/:id/tasks/:taskId` | — | 204 |

`Task` = `{ title, problem, todo, outcome, dependsOn?: [{ title, reason }], done?: boolean }` — the four text fields are required non-empty (400 otherwise). Unknown project/task id (or a task id from another project) → 404. `MONGODB_URI` unset → 503 on every `/api/projects` route.

**Prefer `PATCH` on a single task for edits** — it's partial and won't disturb `done` flags the app is live-syncing. Example: reword a task's what-to-do:

```bash
curl -X PATCH localhost:3001/api/projects/$PID/tasks/$TID \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps here."}'
```

Avoid `PUT` with `tasks` while a user is mid-review unless asked — it recreates every task with new ids.
