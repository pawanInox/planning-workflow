# plan-to-linear 🃏

Paste a markdown plan → review it task-by-task like a card deck → ship the approved tasks to Linear as linked issues.

Built for a workflow where plans are written (often by an AI) faster than they can be reviewed: every task becomes a swipeable card, the plan arrives with its own architecture diagram and spec, review progress persists in MongoDB, and an AI agent can edit tasks through the API while you watch the cards update live.

## How it works

1. **Get a plan in.** Either run a planning skill in Claude Code — it writes the plan, creates the project, and hands back the review link — or paste markdown yourself in the app's format (*Copy AI format prompt* makes any AI reshape a free-form plan for you).
2. **Review** — swipe through the Focus deck (✓ approve / ✗ skip) or work the List view, where tasks are grouped into independent tracks so you can see what two people could pick up in parallel. Beside the cards sit the plan's flowchart, sequence diagram and spec; selecting a task lights up the parts it touches.
3. **Ship** — send the approved tasks to Linear as issues; `Depends on` lines become real *blocks* relations. Skipped tasks stay behind in the app, and so does the spec.

## Quick start

### Docker (everything included)

```bash
docker compose up --build
```

- App: http://localhost:5173
- MongoDB (for Robo 3T etc.): `mongodb://localhost:27019/plan-to-linear`
- Optional: export `LINEAR_API_KEY` / `GIPHY_API_KEY` in your shell first to enable shipping and card memes.

The web container serves a **built** bundle, so code changes need `--build` to show up. For iterating, use local dev instead.

### Local dev

```bash
cp .env.example .env   # then ADD MONGODB_URI (it is not in the example file)
npm install
npm run dev            # vite on 5173 + API on 3001
```

Without `MONGODB_URI` the app still works for a single session (paste → review → ship); saving, the projects page, and reopening are disabled gracefully.

### Where things live in the browser

| URL | Screen |
|---|---|
| `/` | Homepage |
| `/?page=new` | Paste a plan |
| `/?page=projects` | Saved projects |
| `/?project=<id>` | That project, straight into review |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | for persistence | e.g. `mongodb://localhost:27019/plan-to-linear` |
| `LINEAR_API_KEY` | for shipping | Linear personal API key |
| `GIPHY_API_KEY` | no | memes on the Focus deck cards |
| `PORT` | no | API port (default 3001) |
| `API_ORIGIN` | no | where Vite proxies `/api` (default `http://localhost:3001`) |

## Plan format

The parser reads exactly this structure (headings verbatim; `### Depends on` optional):

```markdown
# Plan: short title

## Task: imperative task title
### Problem
Why this task exists.
Scenario: a concrete example of today's wrong behavior.
### What to do
1. Concrete steps, real file paths.
2. Numbered steps and `- ` bullets render as formatted lists.
### Expected outcome
A verifiable end state.
Before: what happens today.
After: what happens once done.
### Depends on
- exact title of another task — why it blocks this one
```

Every card carries two one-click prompts: **🤖 Copy prompt** turns the task into a self-contained brief for an AI agent to implement it, and **🔍 Copy review** asks an agent to review what was built against the same task.

## What a project carries besides tasks

The markdown format holds only the tasks. Three further artifacts ride along on the project itself, generated at planning time and shown as a Flowchart / Sequence / Spec toggle beside the cards:

| Field | What it is |
|---|---|
| `diagram` | Mermaid architecture flowchart of the components the plan touches |
| `sequenceDiagram` | Mermaid sequence diagram of the runtime flow through those same components |
| `spec` | Structured spec, `{ section: [{ id, ...anything }] }` — data models, API contracts, interfaces |

Each task can name the `diagramNodes` and `specRefs` it touches. Select a task and the review screen glows those flowchart nodes and spec entries and dims the rest, so you can see the blast radius while you read the card. Sequence participant ids reuse the flowchart's node ids for the same reason.

**The app never generates any of this** — it only renders it. A `PUT /projects/:id` with just `diagram`, `sequenceDiagram` or `spec` fixes one up without disturbing tasks or their live approval state.

## API

REST under `/api/v1` with a standard envelope — success `{ "status": "ok", "message", "data" }`, error `{ "status": "error", "message", "details"? }`. Projects and their tasks are full CRUD; tasks are individually addressable:

```bash
# reword a task while someone reviews it — the app picks it up within 3 s
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps."}'
```

Full endpoint reference lives in [CLAUDE.md](CLAUDE.md) (which doubles as the API doc for AI sessions). Also under `/api/v1`: `GET /teams` and `POST /issues` (Linear), `GET /memes?q=`.

## Working with Claude

- [CLAUDE.md](CLAUDE.md) auto-loads in any Claude Code session in this repo — Claude can list, edit, and mark tasks done via the API with no extra setup; the review screen polls every 3 s and reflects external edits live.
- **`/yak-dai`** ([.claude/skills/yak-dai](.claude/skills/yak-dai)) — for work you can already describe. It interviews you, synthesizes a spec, breaks it into tickets, mints the flowchart, sequence diagram and spec JSON, then creates the project and returns the review URL.
- **`/yang-mai-sure`** ([.claude/skills/yang-mai-sure](.claude/skills/yang-mai-sure)) — for work still too foggy for one sitting. It charts the unknowns as investigation tickets and works them until the way is clear, then runs the same pipeline.
- Both skills carry hard constraints on how the flowchart is drawn (numbered stages down the page, an edge budget, shared helpers belong in the spec rather than as boxes). The review panel is narrow and read at a glance, so a diagram that ignores them is unreadable where it matters.
- Code conventions come from two vendored skills: [vite-react-best-practices](.agents/skills/vite-react-best-practices) (frontend) and [express-typescript-api-best-practices](.agents/skills/express-typescript-api-best-practices) (server); repo-specific deviations are recorded in CLAUDE.md.

## Architecture

```
src/                      # React + Vite
├── App.tsx               # state container + lazy page switch (no router lib; URL mirrors state)
├── pages/                # Home, Input, Projects, Review, Ship — one lazy chunk each
├── components/
│   ├── TaskCard.tsx      # a task in the List view
│   ├── CardViewer.tsx    # the Focus deck (drag, throw, undo)
│   ├── DiagramPanel.tsx  # mermaid render + zoom/pan + per-task highlight
│   ├── SpecPanel.tsx     # the Spec tab, rendered or raw JSON
│   └── ThemeToggle.tsx
└── lib/api.ts            # ALL server calls (typed fetch wrappers)

server/                   # Express + TypeScript (tsx)
├── index.ts              # composition root
└── src/
    ├── v1/routes → controllers → services → repositories → models
    ├── schemas/          # Zod input validation (per-field 400 details)
    ├── middlewares/      # validate + central error-handler
    └── config/           # env + Mongo connection

shared/
├── parse.ts              # plan markdown parser ⇄ serializer (used by both sides)
└── groups.ts             # groupTasks — splits tasks into independent tracks

public/home/              # product screenshots used by the homepage
```

Two MongoDB collections: `projects` and `tasks` (`projectId` FK, `order`, cascade delete).

## Also in this repo

- `yak-dai-demo/` — a self-contained HTML deck introducing the tool. Open `index.html` in a browser: arrow keys navigate, `E` enables inline text editing, and printing gives one slide per page.
- `docs/adr/` — decision records, currently [why the diagrams are generated at planning time](docs/adr/0001-diagram-generated-at-planning-time.md) rather than by the app.

## Testing

```bash
npm test           # parser round-trip, track grouping, service rules (in-memory fake repos), Zod schemas
npx tsc --noEmit   # typecheck
npm run build      # production bundle
```

45 tests, no framework — `node:test` run through `tsx`.

## Exposing it temporarily

`vite.config.ts` allowlists `*.trycloudflare.com` for both `server` and `preview`, so a quick tunnel works without a 403:

```bash
cloudflared tunnel --url http://localhost:5173
```

That URL is public and the app has no authentication, so anything in your MongoDB is reachable by whoever holds the link.
