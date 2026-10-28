# Yak Dai (repo: plan-to-linear)

Paste a markdown plan → review tasks card-by-card (Focus deck or List) → hand approved tasks to an agent via a copied prompt. Projects and tasks persist in MongoDB.

- Frontend: React + Vite (`src/`), dev server on 5173, proxies `/api` to the API. Follow the `vite-react-best-practices` skill (`.agents/skills/`). In this repo that means: pages in `src/pages/` (lazy-loaded), shared UI in `src/components/`, ALL server calls in `src/lib/api.ts` (no raw `fetch` in components). Deliberate deviation: no React Query/SWR — plain fetch wrappers in `lib/api.ts` until caching/retries matter. Styles live in `src/theme.css`: components reference only the `--color-*` semantic tokens (better-colors), never the primitive ramps; polish follows better-ui (shadow rings, 0.96 press scale, motion gated on reduced-motion).
- API: Express (`server/`), port 3001 (`PORT` env). Follow the `express-typescript-api-best-practices` skill (`.agents/skills/`). In this repo: `v1/routes → controllers → services → repositories → models` under `server/src/`, Zod schemas in `schemas/` applied via the `validate` middleware, central `error-handler`, envelope responses (below); `server/index.ts` is the composition root. Deliberate deviations: no Swagger (this file is the API doc), auth is Google sign-in (server-side OAuth via `google-auth-library`) with an httpOnly `yd_session` cookie for the browser and `Authorization: Bearer ydk_…` personal API tokens for agents — no JWTs, every session and token is a revocable Mongo row, no Mongo transactions (standalone Mongo doesn't support them).
- Shared parser/serializer: `shared/parse.ts` (`parsePlan` ⇄ `planToMarkdown`). Also in `shared/`: `groups.ts` (`groupTasks` — splits tasks into independent tracks, the connected components of the `dependsOn` graph, so no track depends on another).
- Run: `npm run dev` (needs `MONGODB_URI` in `.env` for persistence, plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` for sign-in — without them every app screen stops at the sign-in page and `/auth/google` sends the browser back there with a "not set up" note; `/auth/me`, logout and existing tokens keep working) or `docker compose up --build` (app on 5173, Mongo browsable on 27019).
- Test: `npm test` (node:test via tsx). Typecheck: `npx tsc --noEmit`.

## Project/task API

Base URL: `http://localhost:3001/api/v1` with `npm run dev`. With `docker compose up`, the api container is not host-published — go through the web proxy instead: `http://localhost:5173/api/v1/...`. If unsure which is running, try 3001 first and fall back to 5173.

**Auth** (every `/projects` route): send `-H "Authorization: Bearer $YAK_DAI_TOKEN"` — a personal API token the user creates in the app (sidebar account menu → API tokens); the browser uses its session cookie instead. No session or token → **401**. Any signed-in caller may `GET` any project by id; **every write is owner-only** (`PUT`/`DELETE` a project, `POST`/`PATCH`/`DELETE` a task) → **403** `only the owner can change this project` otherwise, including projects saved before sign-in existed until `scripts/assign-owner.ts <email>` gives them an owner. `GET /projects` lists only the caller's own projects; a project is created owned by the caller (a body `ownerId` is ignored). `GET /projects/:id` also returns `owner: { id, name, avatarUrl } | null` (never the email) and `canEdit`. Auth routes under `/api/v1/auth`: `GET /google?returnTo=`, `GET /google/callback`, `GET /me`, `POST /logout`, and `GET`/`POST`/`DELETE /tokens[/:id]` (session-only — a token cannot manage tokens).

**Response envelope** (every endpoint): success → `{ "status": "ok", "message": string, "data": ... }`; error → `{ "status": "error", "message": string, "details"?: [{ field, message }] }`. The payloads below are what arrives in `data`.

Use this to read or edit a user's plan while they review it in the app — the review screen polls every 3 s and reflects external task edits automatically.

**Deep link**: `http://localhost:5173/?project=<id>` opens that project directly in review. Bare `/` is the marketing homepage (`src/pages/HomePage.tsx`), `/?page=new` the paste screen, `/?page=projects` the paste screen with the project sidebar open (the saved-project list lives in the sidebar on every app screen). After creating a project via `POST /api/v1/projects`, hand the user this URL (the `/yak-dai` skill does this automatically after planning).

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

`Task` = `{ title, problem, todo, outcome, dependsOn?: [{ title, reason }], done?: boolean, diagramNodes?: [string], specRefs?: [string] }` — the four text fields are required non-empty (Zod-validated, 400 with per-field `details` otherwise). Unknown project/task id (or a task id from another project) → 404. `MONGODB_URI` unset → 503 on every `/api/v1/projects` route.

**Prefer `PATCH` on a single task for edits** — it's partial and won't disturb `done` flags the app is live-syncing. Example: reword a task's what-to-do:

```bash
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H "Authorization: Bearer $YAK_DAI_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps here."}'
```

Avoid `PUT` with `tasks` while a user is mid-review unless asked — it recreates every task with new ids.

`diagram` is the project's mermaid architecture flowchart and `sequenceDiagram` its mermaid sequence diagram (both source text), generated at planning time (see `docs/adr/0001`); the review screen shows a Flowchart/Sequence toggle when both exist. Sequence participant ids must reuse the flowchart's node ids (`participant apiServer as ...`). `diagramNodes` on a task lists the node ids that task touches — the review screen glows those flowchart nodes, and in the sequence view brightens the messages between those participants while dimming the rest. A sequence message that implements a spec entry ends its label with that spec entry id in brackets — `web->>apiServer: create project [postProjects]` — as the last thing on the line (one tag per message; `shared/seqtags.ts` `parseSeqTags` reads it). The app strips the tag before mermaid renders and shows the entry when the arrow is hovered; an unknown id shows a warning there. The app never generates diagrams; a `PUT { diagram }` / `PUT { sequenceDiagram }` (without `tasks`) or `PATCH { diagramNodes }` is the way to fix one up — including adding or fixing sequence tags — without disturbing the tasks.

`spec` is the project's structured spec — `{ [section]: [{ id, ...anything }] }` — generated at planning time like the diagrams. Sections are **open** (`dataModels`, `api`, `interfaces` are typical, not a closed list) and an entry's contents are never inspected by the server; only the skeleton is validated, plus one rule: entry `id`s are unique across the WHOLE spec, since a task's `specRefs` name them bare (a repeat → 400 with `details[0].field` pointing at the second one, e.g. `spec.api.0.id`). `specRefs` on a task names the entries that task implements — the review screen glows them in the Spec tab, dims the rest, and shows them as chips on the card (a ref naming no entry shows as a dashed warning chip — the API accepts unknown refs on purpose, so the card is where the typo surfaces). The spec **stays in the app**: both copied prompts (implement and review) carry the task's four sections and no spec block. Like the diagrams, the app never generates any of this: a spec-only `PUT { spec }` (without `tasks`) or a `PATCH { specRefs }` is the way to fix one up, and neither disturbs the tasks the review screen is live-syncing.
