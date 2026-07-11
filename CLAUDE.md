# plan-to-linear

Paste a markdown plan → review tasks card-by-card (Focus deck or List) → ship the done ones to Linear. Projects and tasks persist in MongoDB.

- Frontend: React + Vite (`src/`), dev server on 5173, proxies `/api` to the API. Frontend code follows the conventions from https://github.com/claudiocebpaz/vite-react-best-practices: pages colocated under `src/pages/` (one per step, lazy-loaded via `React.lazy` + `Suspense`), shared UI in `src/components/`, all server calls in `src/lib/api.ts` (no raw `fetch` in components; swap for React Query if caching ever matters), named exports only (no default exports), memoize strategically rather than by default. Keep new frontend code within this structure.
- API: Express (`server/`), port 3001 (`PORT` env). Server code follows the conventions from https://github.com/MILLERMARRU/express-typescript-api-best-practices: layered `v1/routes → controllers → services → repositories → models` under `server/src/`, with `config/` (env + db), `schemas/` (Zod input validation applied via the `validate` middleware before controllers), `middlewares/` (validation + central `error-handler`), and the standardized response envelope (below). Business logic lives in services only — controllers translate HTTP, repositories talk to Mongoose models. `server/index.ts` is the composition root. Keep new endpoints within this structure.
- Shared parser/serializer: `shared/parse.ts` (`parsePlan` ⇄ `planToMarkdown`).
- Run: `npm run dev` (needs `MONGODB_URI` in `.env` for persistence) or `docker compose up --build` (app on 5173, Mongo browsable on 27019).
- Test: `npm test` (node:test via tsx). Typecheck: `npx tsc --noEmit`.

## Project/task API

Base URL: `http://localhost:3001/api/v1` with `npm run dev`. With `docker compose up`, the api container is not host-published — go through the web proxy instead: `http://localhost:5173/api/v1/...`. If unsure which is running, try 3001 first and fall back to 5173.

**Response envelope** (every endpoint): success → `{ "status": "ok", "message": string, "data": ... }`; error → `{ "status": "error", "message": string, "details"?: [{ field, message }] }`. The payloads below are what arrives in `data`.

Use this to read or edit a user's plan while they review it in the app — the review screen polls every 3 s and reflects external task edits automatically.

**Deep link**: `http://localhost:5173/?project=<id>` opens that project directly in review. After creating a project via `POST /api/v1/projects`, hand the user this URL (the `/linear-plan` skill does this automatically after planning).

| Method & path | Body | `data` |
|---|---|---|
| `GET /api/v1/projects` | — | `[{ id, title, taskCount, doneCount, updatedAt }]` |
| `POST /api/v1/projects` | `{ title, tasks: [Task] }` | 201, project + tasks (with ids, ordered) |
| `GET /api/v1/projects/:id` | — | project + `tasks` sorted by `order`, each with its own `id` |
| `PUT /api/v1/projects/:id` | `{ title?, tasks? }` | tasks value replaces ALL tasks (new ids) |
| `DELETE /api/v1/projects/:id` | — | 200, cascades tasks |
| `POST /api/v1/projects/:id/tasks` | `Task` | 201, appended task |
| `PATCH /api/v1/projects/:id/tasks/:taskId` | any subset of Task fields | updated task |
| `DELETE /api/v1/projects/:id/tasks/:taskId` | — | 200 |

`Task` = `{ title, problem, todo, outcome, dependsOn?: [{ title, reason }], done?: boolean }` — the four text fields are required non-empty (Zod-validated, 400 with per-field `details` otherwise). Unknown project/task id (or a task id from another project) → 404. `MONGODB_URI` unset → 503 on every `/api/v1/projects` route. Also under `/api/v1`: `GET /teams`, `POST /issues` (Linear), `GET /memes?q=`.

**Prefer `PATCH` on a single task for edits** — it's partial and won't disturb `done` flags the app is live-syncing. Example: reword a task's what-to-do:

```bash
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps here."}'
```

Avoid `PUT` with `tasks` while a user is mid-review unless asked — it recreates every task with new ids.
