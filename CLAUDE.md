# plan-to-linear

Paste a markdown plan → review tasks card-by-card (Focus deck or List) → ship the done ones to Linear. Projects and tasks persist in MongoDB.

- Frontend: React + Vite (`src/`), dev server on 5173, proxies `/api` to the API. Follow the `vite-react-best-practices` skill (`.agents/skills/`). In this repo that means: pages in `src/pages/` (lazy-loaded), shared UI in `src/components/`, ALL server calls in `src/lib/api.ts` (no raw `fetch` in components). Deliberate deviation: no React Query/SWR — plain fetch wrappers in `lib/api.ts` until caching/retries matter.
- API: Express (`server/`), port 3001 (`PORT` env). Follow the `express-typescript-api-best-practices` skill (`.agents/skills/`). In this repo: `v1/routes → controllers → services → repositories → models` under `server/src/`, Zod schemas in `schemas/` applied via the `validate` middleware, central `error-handler`, envelope responses (below); `server/index.ts` is the composition root. Deliberate deviations: no Swagger (this file is the API doc), no JWT/auth (single-user tool), no Mongo transactions (standalone Mongo doesn't support them).
- Shared parser/serializer: `shared/parse.ts` (`parsePlan` ⇄ `planToMarkdown`). Also in `shared/`: `groups.ts` (`groupTasks` — splits tasks into independent tracks, the connected components of the `dependsOn` graph, so no track depends on another).
- Run: `npm run dev` (needs `MONGODB_URI` in `.env` for persistence) or `docker compose up --build` (app on 5173, Mongo browsable on 27019).
- Test: `npm test` (node:test via tsx). Typecheck: `npx tsc --noEmit`.

## Project/task API

Base URL: `http://localhost:3001/api/v1` with `npm run dev`. With `docker compose up`, the api container is not host-published — go through the web proxy instead: `http://localhost:5173/api/v1/...`. If unsure which is running, try 3001 first and fall back to 5173.

**Response envelope** (every endpoint): success → `{ "status": "ok", "message": string, "data": ... }`; error → `{ "status": "error", "message": string, "details"?: [{ field, message }] }`. The payloads below are what arrives in `data`.

Use this to read or edit a user's plan while they review it in the app — the review screen polls every 3 s and reflects external task edits automatically.

**Deep link**: `http://localhost:5173/?project=<id>` opens that project directly in review. Bare `/` is the marketing homepage (`src/pages/HomePage.tsx`, styles in `src/pages/home.css`, product screenshots in `public/home/`), `/?page=new` the paste screen, `/?page=projects` the saved list. After creating a project via `POST /api/v1/projects`, hand the user this URL (the `/yak-dai` skill does this automatically after planning).

| Method & path | Body | `data` |
|---|---|---|
| `GET /api/v1/projects?page=1&limit=10` | — | **paginated**: `{ items: [{ id, title, taskCount, doneCount, updatedAt }], page, limit, total, totalPages }` — newest first. Both params optional (`page` ≥ 1, `limit` 1–100, default 10); a page past the end returns empty `items`, not an error |
| `POST /api/v1/projects` | `{ title, tasks: [Task], diagram?, sequenceDiagram?, spec? }` | 201, project + tasks (with ids, ordered) |
| `GET /api/v1/projects/:id` | — | project (incl. `diagram`/`sequenceDiagram`/`spec` if set) + `tasks` sorted by `order`, each with its own `id` |
| `PUT /api/v1/projects/:id` | `{ title?, tasks?, diagram?, sequenceDiagram?, spec? }` | tasks value replaces ALL tasks (new ids); every other field merges on its own |
| `DELETE /api/v1/projects/:id` | — | 200, cascades tasks |
| `POST /api/v1/projects/:id/tasks` | `Task` | 201, appended task |
| `PATCH /api/v1/projects/:id/tasks/:taskId` | any subset of Task fields | updated task |
| `DELETE /api/v1/projects/:id/tasks/:taskId` | — | 200 |

`Task` = `{ title, problem, todo, outcome, dependsOn?: [{ title, reason }], done?: boolean, diagramNodes?: [string], specRefs?: [string] }` — the four text fields are required non-empty (Zod-validated, 400 with per-field `details` otherwise). Unknown project/task id (or a task id from another project) → 404. `MONGODB_URI` unset → 503 on every `/api/v1/projects` route. Also under `/api/v1`: `GET /teams`, `POST /issues` (Linear), `GET /memes?q=`.

**Prefer `PATCH` on a single task for edits** — it's partial and won't disturb `done` flags the app is live-syncing. Example: reword a task's what-to-do:

```bash
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps here."}'
```

Avoid `PUT` with `tasks` while a user is mid-review unless asked — it recreates every task with new ids.

`diagram` is the project's mermaid architecture flowchart and `sequenceDiagram` its mermaid sequence diagram (both source text), generated at planning time (see `docs/adr/0001`); the review screen shows a Flowchart/Sequence toggle when both exist. Sequence participant ids must reuse the flowchart's node ids (`participant apiServer as ...`). `diagramNodes` on a task lists the node ids that task touches — the review screen glows those flowchart nodes, and in the sequence view brightens the messages between those participants while dimming the rest. The app never generates diagrams; a `PUT { diagram }` / `PUT { sequenceDiagram }` (without `tasks`) or `PATCH { diagramNodes }` is the way to fix one up.

`spec` is the project's structured spec — `{ [section]: [{ id, ...anything }] }` — generated at planning time like the diagrams. Sections are **open** (`dataModels`, `api`, `interfaces` are typical, not a closed list) and an entry's contents are never inspected by the server; only the skeleton is validated, plus one rule: entry `id`s are unique across the WHOLE spec, since a task's `specRefs` name them bare (a repeat → 400 with `details[0].field` pointing at the second one, e.g. `spec.api.0.id`). `specRefs` on a task names the entries that task implements — the review screen glows them in the Spec tab, dims the rest, and shows them as chips on the card (a ref naming no entry shows as a dashed warning chip — the API accepts unknown refs on purpose, so the card is where the typo surfaces). The spec **stays in the app**: a shipped Linear issue body and both copied prompts carry the task's four sections and no spec block. Like the diagrams, the app never generates any of this: a spec-only `PUT { spec }` (without `tasks`) or a `PATCH { specRefs }` is the way to fix one up, and neither disturbs the tasks the review screen is live-syncing.
