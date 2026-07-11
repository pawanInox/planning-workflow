# Plan: Persist plans as MongoDB projects

## Task: define the project domain model and repository port
### Problem
The server has no domain layer — `server/index.ts` is a single file mixing HTTP, Linear SDK calls, and business rules, so there is nothing for a persistence layer to implement against and no types describing what a saved project or task even is.
Scenario: a developer asked to "add Mongo persistence" opens `server/` and finds only `index.ts` with Express routes; any repository they write has no interface to satisfy, so persistence details leak straight into route handlers.
### What to do
1. Create `server/src/domain/project.ts` exporting pure types: `TaskEntity` (`id: string`, `projectId: string`, `order: number`, `title`, `problem`, `todo`, `outcome`, `dependsOn: { title: string; reason: string }[]`, `done: boolean`), `Project` (`id: string`, `title: string`, `createdAt: Date`, `updatedAt: Date`), `ProjectWithTasks` (`Project & { tasks: TaskEntity[] }` — tasks always sorted by `order`), and `NewTask` (`Omit<TaskEntity, 'id' | 'projectId' | 'order'>` with `dependsOn`/`done` optional). Note: parser-derived `errors`/`warnings` from `shared/parse.ts` are deliberately excluded — they are recomputed on parse, never persisted.
2. Create `server/src/domain/project-repository.ts` exporting the `ProjectRepository` interface (the port): `create(data: { title: string; tasks: NewTask[] }): Promise<ProjectWithTasks>`, `list(): Promise<{ project: Project; taskCount: number; doneCount: number }[]>`, `getById(id: string): Promise<ProjectWithTasks | null>`, `update(id: string, data: { title?: string; tasks?: NewTask[] }): Promise<ProjectWithTasks | null>` (a `tasks` value replaces all of the project's tasks), `delete(id: string): Promise<boolean>` (cascades the project's tasks), `addTask(projectId: string, task: NewTask): Promise<TaskEntity | null>` (appends with next `order`), `updateTask(projectId: string, taskId: string, patch: Partial<NewTask>): Promise<TaskEntity | null>` (null when the task doesn't exist or belongs to another project), `removeTask(projectId: string, taskId: string): Promise<boolean>`.
3. These files must import nothing from Express, Mongoose, or `node_modules` — pure TypeScript only (importing types from `shared/parse.ts` is allowed).
### Expected outcome
`server/src/domain/` contains the two files; `npx tsc --noEmit` passes; grepping the domain files for `express|mongoose` returns nothing.
Before: `server/` has only `index.ts`; there is no type or interface a Mongo repository could implement.
After: the same developer finds a `ProjectRepository` port with eight typed methods over two entities and implements it without touching any route handler.

## Task: add project CRUD use-cases with injected repository
### Problem
Business rules for saving a project (what makes a task valid, what happens on unknown ids) have no home — today the only validation in the codebase lives inline in the `/api/issues` handler in `server/index.ts`, unreachable and unreusable for project CRUD.
Scenario: a script POSTs a project whose second task has an empty `todo`; with no use-case layer the invalid task would be written to MongoDB verbatim and later crash the Linear ship step, which requires non-empty `title`/`problem`/`todo`/`outcome`.
### What to do
1. Create `server/src/application/project-use-cases.ts` exporting typed errors `ValidationError` and `NotFoundError` (plain classes extending `Error`), and a factory `makeProjectUseCases(repo: ProjectRepository)` returning: `createProject`, `listProjects`, `getProject`, `updateProject`, `deleteProject`, `addTask`, `updateTask`, `removeTask`.
2. Business rules: project `title` must be a non-empty string; every task must have non-empty `title`, `problem`, `todo`, `outcome` (the same rule as `server/index.ts` line 25); `dependsOn` defaults to `[]` and `done` to `false` when omitted; task patches may not set `title`/`problem`/`todo`/`outcome` to empty strings. Violations throw `ValidationError`. Unknown project id, or a task id that doesn't belong to the given project, throws `NotFoundError`.
3. The file imports only from `../domain/` — no Express, no Mongoose.
4. Create `server/src/application/project-use-cases.test.ts` using `node:test` + `assert` (same style as `shared/parse.test.ts`) with an in-memory fake repository (two `Map`s — projects and tasks — with counter ids) implementing `ProjectRepository`. Cover: create returns the project with task ids, `order` 0..n-1, and defaults applied; create with an empty `todo` throws `ValidationError`; `getProject` on unknown id throws `NotFoundError`; `updateTask` flips `done`; `updateTask` with a task id from a different project throws `NotFoundError`; `deleteProject` removes the project's tasks (fake's task map no longer holds them).
5. Update the `test` script in `package.json` to `tsx --test shared/parse.test.ts server/src/application/project-use-cases.test.ts`.
### Expected outcome
`npm test` runs both suites green; the use-case file has no framework imports.
Before: POSTing a task with an empty `todo` has no rule to stop it anywhere outside the Linear ship handler.
After: the same POST is rejected by `createProject` with a `ValidationError` before any repository call — proven by the unit test, no database needed.
### Depends on
- define the project domain model and repository port — the use-case factory's parameter is the `ProjectRepository` interface and its return values are `Project`/`TaskEntity`; without those types there is nothing to inject or validate against

## Task: implement the mongoose project repository
### Problem
The `ProjectRepository` port has no real implementation — nothing actually reads or writes MongoDB, so projects cannot survive a server restart.
Scenario: a reviewer saves a 17-task project, the laptop reboots, and on restart the API has nowhere to load it from because no adapter persists the data.
### What to do
1. `npm install mongoose` (mongoose ships its own types).
2. Create `server/src/infrastructure/mongoose-project-repository.ts` with two models: `ProjectModel` (`projectSchema`: `title` required, `{ timestamps: true }`) and `TaskModel` (`taskSchema`: `projectId: { type: ObjectId, ref: 'Project', required: true, index: true }`, `order: Number` required, `title`/`problem`/`todo`/`outcome` required strings, `dependsOn: [{ title, reason, _id: false }]`, `done: { type: Boolean, default: false }`, `{ timestamps: true }`).
3. `class MongooseProjectRepository implements ProjectRepository`: `create` inserts the project then `insertMany` its tasks with `order` 0..n-1; `getById` composes project + `TaskModel.find({ projectId }).sort({ order: 1 })`; `list` computes `taskCount`/`doneCount` per project (aggregate or a `find` + count per project — either is fine at this scale); `update` with `tasks` deletes the project's tasks and re-inserts; `delete` removes the project and `deleteMany({ projectId })`; `addTask` appends with `order` = current max + 1; `updateTask`/`removeTask` filter on BOTH `_id: taskId` AND `projectId` so a task id from another project resolves to null/false. Map documents to plain entities (`_id.toString()` → `id`; never leak mongoose documents past this file). Invalid ObjectId strings must resolve to `null`/`false`, not throw.
4. Export `connectDb(uri: string)` wrapping `mongoose.connect`.
5. Add `MONGODB_URI=mongodb://localhost:27017/plan-to-linear` to `.env.example` alongside the existing `LINEAR_API_KEY` line.
### Expected outcome
With MongoDB running locally, a scratch script that calls `connectDb`, `create`, `getById`, and `delete` round-trips a project; after `delete`, `TaskModel.countDocuments({ projectId })` is 0; restarting the process between `create` and `getById` still finds it. `npx tsc --noEmit` passes.
Before: saving a project has nowhere to go; a server restart loses everything.
After: the reviewer's 17-task project survives a full process restart; its tasks live in the `tasks` collection keyed by `projectId` and come back sorted by `order` with done-flags intact.
### Depends on
- define the project domain model and repository port — this class `implements ProjectRepository`; without the port there is no contract to implement and no entity shapes to map documents onto

## Task: expose the project CRUD http api
### Problem
Use-cases and the Mongo repository exist but no HTTP surface reaches them — external tools and the frontend still have no way to create, read, update, or delete projects or tasks.
Scenario: a teammate runs `curl localhost:3001/api/projects` to script a report of open tasks and gets Express's default 404 HTML because the route does not exist.
### What to do
1. Create `server/src/http/project-router.ts` exporting `makeProjectRouter(useCases)` returning an `express.Router` with: `POST /` → 201 project + tasks, `GET /` → summaries (`{ id, title, taskCount, doneCount, updatedAt }`), `GET /:id` → project + tasks, `PUT /:id`, `DELETE /:id` → 204, `POST /:id/tasks` → 201 created task, `PATCH /:id/tasks/:taskId` → updated task, `DELETE /:id/tasks/:taskId` → 204. Map `ValidationError` → 400 `{ error }`, `NotFoundError` → 404 `{ error }`, anything else → 500.
2. In `server/index.ts` (composition root): read `process.env.MONGODB_URI`; when set, `await connectDb(uri)`, build `MongooseProjectRepository` → `makeProjectUseCases(repo)` → `app.use('/api/projects', makeProjectRouter(useCases))`. When unset, mount a fallback handler on `/api/projects` returning 503 `{ error: 'MONGODB_URI not set — copy .env.example to .env' }` (same graceful-degradation pattern as the `LINEAR_API_KEY` check on line 14). Existing `/api/teams`, `/api/issues`, `/api/meme` routes stay untouched.
3. Route handlers contain no business logic — they only translate HTTP ⇄ use-case calls.
### Expected outcome
With MongoDB running: `curl -X POST localhost:3001/api/projects -H 'content-type: application/json' -d '{"title":"P","tasks":[{"title":"t","problem":"p","todo":"d","outcome":"o"}]}'` returns 201 with a project `id` and a task with its own `id`; `GET /api/projects` lists it with counts; `PATCH /api/projects/<id>/tasks/<taskId> -d '{"done":true}'` flips the flag; `DELETE /api/projects/<id>` returns 204 and a subsequent `GET /:id` returns 404. Without `MONGODB_URI`, every `/api/projects` call returns 503 with the helpful message.
Before: `curl localhost:3001/api/projects` returns Express's 404 page.
After: the same curl returns a JSON array of project summaries the teammate can script against.
### Depends on
- add project CRUD use-cases with injected repository — the router is a thin translator; without use-cases every handler would have nothing to call and nowhere to get 400/404 semantics from
- implement the mongoose project repository — the composition root must construct a concrete repository to inject; without it the server cannot wire `/api/projects` to real storage

## Task: add a plan-markdown serializer for round-tripping saved tasks
### Problem
The frontend's entire pipeline derives tasks from markdown (`md → parsePlan`), but a project loaded from the API arrives as structured tasks with no markdown — there is no serializer to turn saved tasks back into the plan format, so reopening a project has no way to rehydrate the editor and review flow.
Scenario: a reviewer reopens yesterday's saved project; the app receives 17 task objects but the review step's `tasks` come from parsing `md`, which is empty — so the screen shows zero cards.
### What to do
1. In `shared/parse.ts`, add `export function planToMarkdown(planTitle: string, tasks: Pick<Task, 'title' | 'problem' | 'todo' | 'outcome' | 'dependsOn'>[]): string` emitting exactly the format `parsePlan` reads: `# Plan: <title>`, then per task `## Task: <title>`, `### Problem`, the problem text, `### What to do`, `### Expected outcome`, and — only when `dependsOn` is non-empty — `### Depends on` with `- <title> — <reason>` lines (em-dash separator, matching the parser's split on line 47; omit the ` — ` when a dep has an empty reason). Blank line between blocks.
2. In `shared/parse.test.ts`, add a round-trip test: build 3 tasks (one with two dependencies incl. a reason, one with multi-line sections, one minimal), assert `parsePlan(planToMarkdown('T', tasks)).tasks` deep-equals the input on `title`/`problem`/`todo`/`outcome`/`dependsOn` and `planTitle === 'T'`.
### Expected outcome
`npm test` passes including the round-trip case.
Before: there is no function anywhere that converts tasks back to plan markdown; reopening a saved project cannot feed the `md → parsePlan` pipeline.
After: `parsePlan(planToMarkdown(title, tasks))` reproduces the same tasks, so a fetched project can rehydrate the editor exactly.

## Task: save the reviewed plan as a project from the review header
### Problem
Even with the CRUD API live, the app never calls it — a reviewer has no button to persist the plan they are reviewing, so all review work still dies with the tab.
Scenario: a reviewer finishes marking 9 of 17 tasks done in List, closes the laptop, and next morning pastes the markdown again from scratch with all done-status gone.
### What to do
1. In `src/App.tsx`, add `const [projectId, setProjectId] = useState<string | null>(null)` and `const [taskIds, setTaskIds] = useState<string[]>([])` (task ids aligned with the saved tasks' order).
2. Add a `💾 Save` button in the review-step header (next to the Ship button, `btn-ghost` class). On click: build the payload `{ title: planTitle || 'Untitled plan', tasks: tasks.filter(t => t.errors.length === 0).map(t => ({ title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome, dependsOn: t.dependsOn, done: done.has(tasks.indexOf(t)) })) }` — note the done-index must be the task's index in the full `tasks` array, not the filtered one. `POST /api/projects` when `projectId` is null, `PUT /api/projects/:id` otherwise; from the response store the project id via `setProjectId` and the returned tasks' ids (in order) via `setTaskIds`.
3. Show transient feedback on the button (`✓ Saved` for 2 s, same pattern as `CopyPromptButton` in `src/TaskCard.tsx`); on non-OK response show the API's `error` string inline near the button.
4. Reset `projectId` to `null` and `taskIds` to `[]` when the user edits the markdown — do this in the textarea `onChange` alongside `setMd`, since edited markdown is a new unsaved plan.
### Expected outcome
Click Save in review: the button flips to `✓ Saved` and `curl localhost:3001/api/projects` now lists the project with the correct `doneCount`. Clicking Save again after more toggles PUTs to the same id (list still has one entry).
Before: nothing in the UI writes to the API; the reviewer's 9/17 progress is unrecoverable after closing the tab.
After: the same reviewer clicks `💾 Save`, and the project with 9 done-flagged tasks exists in MongoDB under one id, each task a document carrying its own id.
### Depends on
- expose the project CRUD http api — the Save button POSTs/PUTs `/api/projects`; without the endpoints every click is a 404 and no project or task ids ever come back

## Task: list and reopen saved projects on the input step
### Problem
Saved projects are write-only — the input step offers no way to see or reopen them, so persistence exists but a reviewer still cannot continue yesterday's review.
Scenario: a reviewer saved "Q3 export feature" yesterday; today the input step shows only an empty textarea, and the only path back is re-pasting the original markdown, which arrives with zero done-status.
### What to do
1. In `src/App.tsx` input step, on mount fetch `GET /api/projects` (wrap in try/catch; treat a 503 or network failure as an empty list — the feature degrades silently when Mongo isn't configured). Store summaries in state.
2. When non-empty, render a "Saved projects" card between the textarea and the Start review button: one row per project showing title, `doneCount/taskCount done`, and updated date, styled with the existing `card` + `pill` classes.
3. On row click: `GET /api/projects/:id`, then (tasks arrive sorted by `order`) `setMd(planToMarkdown(p.title, p.tasks))`, `setDone(new Set(p.tasks.flatMap((t, i) => t.done ? [i] : [])))`, `setTaskIds(p.tasks.map(t => t.id))`, `setProjectId(p.id)`, `setStep('review')` — in that order. Important: the existing `useEffect(() => { setDone(new Set()); ... }, [md])` in `App.tsx` would wipe the hydrated done-set; move that reset out of the effect and into the textarea `onChange` handler (it belongs to user edits, not programmatic loads) so hydration survives.
### Expected outcome
Save a project, reload the page: the input step lists it with the right done count; clicking it opens review with the same cards and the done-set intact (Ship button count matches yesterday's). With `MONGODB_URI` unset the input step looks exactly as before — no list, no error.
Before: after a reload the input step is an empty textarea; done-status is gone even if the reviewer kept the markdown.
After: the reviewer clicks "Q3 export feature — 9/17 done" and lands in review with 9 tasks already marked done.
### Depends on
- expose the project CRUD http api — the list and reopen flows call `GET /api/projects` and `GET /api/projects/:id`; without them there is nothing to render or hydrate from
- add a plan-markdown serializer for round-tripping saved tasks — reopening feeds `planToMarkdown` output into the existing `md → parsePlan` pipeline; without the serializer the fetched tasks cannot become editor state and review shows zero cards
- save the reviewed plan as a project from the review header — reopening sets the `projectId`/`taskIds` state that task introduces; without it the loaded project cannot be re-saved or synced back to the same documents

## Task: sync done toggles to the saved project
### Problem
After a project is saved, toggling tasks done (List toggle or Focus swipe) only mutates local React state — the DB copy silently drifts, so the next reopen shows stale progress.
Scenario: a reviewer saves a project at 3/17 done, marks 6 more done in the Focus deck, closes the tab trusting it was saved, and tomorrow reopens to find it still says 3/17.
### What to do
1. In `src/App.tsx`, add an effect that syncs done-status when `projectId` is set: keep the previously synced set in a `useRef<Set<number>>`, and on every `done` change compute added/removed indices and for each fire `PATCH /api/projects/${projectId}/tasks/${taskIds[i]}` with `{ done: true }` / `{ done: false }` (fire-and-forget `fetch`; log failures with `console.warn`; skip indices with no entry in `taskIds` — those are error-tasks that were never saved). Update the ref after dispatching. This single effect covers both the List toggle and every Focus-deck path (swipe, undo, unmark) because all of them go through `setDone`.
2. Reset the ref whenever `projectId` changes (a freshly saved or loaded project starts from its persisted state — on save/load, set the ref to the current `done` so the initial state is not re-PATCHed).
3. Skip syncing entirely when `projectId` is null (unsaved plans stay purely local).
### Expected outcome
Save a project, toggle two tasks done in List and swipe one done in Focus, then `curl localhost:3001/api/projects/:id`: all three tasks show `"done": true` without clicking Save again; reloading and reopening shows the updated count.
Before: the DB stays at 3/17 no matter how many toggles happen after saving; reopening shows stale progress.
After: the same reviewer's 6 extra swipes are each PATCHed as they happen, and tomorrow's reopen shows 9/17.
### Depends on
- expose the project CRUD http api — the sync effect calls `PATCH /api/projects/:id/tasks/:taskId`; without that endpoint every toggle logs a 404 and nothing persists
- save the reviewed plan as a project from the review header — syncing keys off the `projectId` and `taskIds` that saving produces; with no saved ids there are no documents to PATCH

## Task: add docker-compose running db, backend, and frontend
### Problem
Running the full stack requires a locally installed MongoDB, a `.env` file, and two npm processes — a teammate cloning the repo cannot try the persistence flow without hand-assembling all three, and there is no single command that brings the whole app up.
Scenario: a new teammate clones the repo, runs `npm run dev`, and every save hits 503 `MONGODB_URI not set`; they spend the morning installing MongoDB and guessing connection strings instead of reviewing plans.
### What to do
1. Create `Dockerfile` at the repo root (single image for both app services, multi-stage): base stage `FROM node:22-alpine`, `COPY package*.json`, `npm ci`, copy the source; a `web` stage that runs `npm run build`; the api needs no build step (it runs via `tsx`).
2. Make the vite `/api` proxy target configurable in `vite.config.ts`: `const api = process.env.API_ORIGIN ?? 'http://localhost:3001'`, use it in `server.proxy` and add the same to `preview.proxy` (vite preview serves the built app in the container). Local `npm run dev` behavior is unchanged by the default.
3. Create `docker-compose.yml` with three services: `mongo` (image `mongo:7`, named volume `mongo-data:/data/db`); `api` (build from the root `Dockerfile`, command `npx tsx server/index.ts`, environment `MONGODB_URI=mongodb://mongo:27017/plan-to-linear` plus pass-through `LINEAR_API_KEY`/`GIPHY_API_KEY`, `depends_on: [mongo]`); `web` (same build, command `npx vite preview --host --port 5173`, environment `API_ORIGIN=http://api:3001`, port `5173:5173`, `depends_on: [api]`). Declare the `mongo-data` volume.
4. Add a `.dockerignore` (`node_modules`, `.env`, `dist`).
5. Document the one-liner in a README section or comment header: `docker compose up --build` → app on `http://localhost:5173`.
### Expected outcome
From a clean checkout with only Docker installed, `docker compose up --build` starts all three services; opening `http://localhost:5173`, pasting a plan, saving, and reopening works end-to-end; `docker compose restart` keeps the saved project (named volume). `npm run dev` outside Docker still works exactly as before.
Before: a fresh clone needs a hand-installed MongoDB and manual env setup; saves 503 until then.
After: the same teammate runs one compose command and reviews, saves, and reopens plans immediately, with data surviving container restarts.
### Depends on
- expose the project CRUD http api — compose's `api` service exists to serve `/api/projects` backed by the `mongo` service; without the wired endpoints the stack has nothing to persist through
- list and reopen saved projects on the input step — the end-to-end compose verification (save → restart → reopen) exercises this flow; without it a fresh-clone user still cannot get saved work back to prove persistence works
