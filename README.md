# Yak Dai 🃏

Repo and database name: `plan-to-linear` (kept for existing data).

Paste a markdown plan → review it task-by-task like a card deck → hand each approved task to an AI agent with one copied prompt.

Built for a workflow where plans are written (often by an AI) faster than they can be reviewed: every task becomes a swipeable card, the plan arrives with its own architecture diagram and spec, review progress persists in MongoDB, and an AI agent can edit tasks through the API while you watch the cards update live.

## How it works

1. **Get a plan in.** Either run a planning skill in Claude Code — it writes the plan, creates the project, and hands back the review link — or paste markdown yourself in the app's format (*Copy AI format prompt* makes any AI reshape a free-form plan for you).
2. **Review** — swipe through the Focus deck (✓ approve / ✗ skip) or work the List view, where tasks are grouped into independent tracks so you can see what two people could pick up in parallel. Beside the cards sit the plan's flowchart, sequence diagram and spec; selecting a task lights up the parts it touches.
3. **Hand off** — copy a ready-to-run prompt for any task, or a code-review prompt to check the work once it lands. Neither carries the spec; it stays in the app.

## Quick start

### Docker (everything included)

```bash
docker compose up --build
```

- App: http://localhost:5173
- MongoDB (for Robo 3T etc.): `mongodb://localhost:27019/plan-to-linear`

The web container serves a **built** bundle, so code changes need `--build` to show up. For iterating, use local dev instead.

### Local dev

```bash
cp .env.example .env   # then ADD MONGODB_URI (it is not in the example file)
npm install
npm run dev            # vite on 5173 + API on 3001
```

Every app screen needs a signed-in Google account (see [Google sign-in](#google-sign-in) below); only the homepage is public. Without `MONGODB_URI` there is nowhere to keep users or projects, so `/auth` and `/projects` answer 503.

### Where things live in the browser

| URL | Screen |
|---|---|
| `/` | Homepage |
| `/?page=new` | Paste a plan |
| `/?page=projects` | Paste a plan, with the project list open (it is in the sidebar on every app screen) |
| `/?project=<id>` | That project, straight into review |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | e.g. `mongodb://localhost:27019/plan-to-linear` |
| `GOOGLE_CLIENT_ID` | for sign-in | OAuth client (type "Web application") from Google Cloud console |
| `GOOGLE_CLIENT_SECRET` | for sign-in | that client's secret |
| `PUBLIC_URL` | for sign-in | the origin the browser uses, default `http://localhost:5173` — builds the OAuth redirect URI and turns on `Secure` cookies when it is https |
| `PORT` | no | API port (default 3001) |
| `API_ORIGIN` | no | where Vite proxies `/api` (default `http://localhost:3001`) |

### Google sign-in

1. In Google Cloud console → APIs & Services → Credentials, create an **OAuth client ID** of type **Web application**.
2. Add the authorized redirect URI `http://localhost:5173/api/v1/auth/google/callback` (that is `${PUBLIC_URL}/api/v1/auth/google/callback`). Vite (dev) and `vite preview` (docker) both proxy `/api`, so the one URI covers `npm run dev` and `docker compose up`.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` in `.env` (dev), or export them before `docker compose up --build` (compose passes them to the api container).

Any Google account can sign in. Each project belongs to whoever created it: the owner sees it in their sidebar and is the only one who can approve, edit or delete it; anyone else signed in can open it read-only from its link.

**Upgrading an existing database:** projects saved before sign-in existed have no owner, so they are read-only for everyone until you run, once, after signing in:

```bash
MONGODB_URI=mongodb://localhost:27019/plan-to-linear npx tsx scripts/assign-owner.ts you@example.com
```

**Tokens for agents:** `/yak-dai`, `/yang-mai-sure` and the curl examples in CLAUDE.md call the API without a browser. Create a token in the app (sidebar account menu → **API tokens**; it is shown once), then `export YAK_DAI_TOKEN=ydk_…` — the skills send it as `Authorization: Bearer`, and projects they create belong to you. Revoke a token from the same dialog.

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
| `sequenceDiagram` | Mermaid sequence diagram of the runtime flow through those same components. A message that implements a spec entry ends its label with that spec entry id in brackets — `web->>apiServer: create project [postProjects]` — and the tag is stripped before rendering |
| `spec` | Structured spec, `{ section: [{ id, ...anything }] }` — data models, API contracts, interfaces |

Each task can name the `diagramNodes` and `specRefs` it touches. Select a task and the review screen glows those flowchart nodes and spec entries and dims the rest, so you can see the blast radius while you read the card. Sequence participant ids reuse the flowchart's node ids for the same reason. Hovering a tagged arrow in the sequence view shows its spec entry (id, name and every field) without leaving the diagram; a tag naming no spec entry id shows a warning instead.

**The app never generates any of this** — it only renders it. A `PUT /projects/:id` with just `diagram`, `sequenceDiagram` or `spec` fixes one up without disturbing tasks or their live approval state.

## API

REST under `/api/v1` with a standard envelope — success `{ "status": "ok", "message", "data" }`, error `{ "status": "error", "message", "details"? }`. Projects and their tasks are full CRUD; tasks are individually addressable:

```bash
# reword a task while someone reviews it — the app picks it up within 3 s
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H "Authorization: Bearer $YAK_DAI_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps."}'
```

Full endpoint reference lives in [CLAUDE.md](CLAUDE.md) (which doubles as the API doc for AI sessions).

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
├── theme.css             # tokens (two-tier: primitives → --color-* roles) + all styles
├── pages/                # Home, SignIn, Input, Review — one lazy chunk each
├── components/
│   ├── Sidebar.tsx       # project list, pagination, delete dialog, account menu
│   ├── TokensDialog.tsx  # personal API tokens: create (shown once), list, revoke
│   ├── TaskCard.tsx      # task body, List-view row, copy-prompt buttons
│   ├── CardViewer.tsx    # the Focus deck (drag, throw, undo)
│   ├── DiagramPanel.tsx  # mermaid render + zoom/pan + per-task highlight
│   ├── SpecPanel.tsx     # the Spec tab, rendered or raw JSON
│   ├── Icon.tsx          # inline currentColor stroke icons
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

Tests, no framework — `node:test` run through `tsx`.

## Exposing it temporarily

`vite.config.ts` allowlists `*.trycloudflare.com` for both `server` and `preview`, so a quick tunnel works without a 403:

```bash
cloudflared tunnel --url http://localhost:5173
```

That URL is public. Google sign-in does **not** work through a quick tunnel: its random `*.trycloudflare.com` hostname cannot be registered as an OAuth redirect URI, so visitors reach only the homepage and the sign-in screen. For sign-in over a tunnel, use a named tunnel or a real domain, register `https://<host>/api/v1/auth/google/callback`, and set `PUBLIC_URL=https://<host>`.
