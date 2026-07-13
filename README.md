# plan-to-linear 🃏

Paste a markdown plan → review it task-by-task like a card deck → ship the approved tasks to Linear as linked issues.

Built for a workflow where plans are written (often by an AI) faster than they can be reviewed: every task becomes a swipeable card, review progress persists in MongoDB, and an AI agent can edit tasks through the API while you watch the cards update live.

## How it works

1. **Paste a plan** in the app's markdown format (or click *Copy AI format prompt* to have any AI reformat a free-form plan for you).
2. **Review** — swipe through the Focus deck (✓ done / ✗ skip) or work the List view with per-card toggles. The project auto-saves to MongoDB the moment you start; every toggle syncs instantly.
3. **Ship** — send the done tasks to Linear as issues; `Depends on` lines become real *blocks* relations.

## Quick start

### Docker (everything included)

```bash
docker compose up --build
```

- App: http://localhost:5173
- MongoDB (for Robo 3T etc.): `mongodb://localhost:27019/plan-to-linear`
- Optional: export `LINEAR_API_KEY` / `GIPHY_API_KEY` in your shell first to enable shipping and card memes.

### Local dev

```bash
cp .env.example .env   # fill in MONGODB_URI (+ optional keys)
npm install
npm run dev            # vite on 5173 + API on 3001
```

Without `MONGODB_URI` the app still works for a single session (paste → review → ship); saving, the projects page, and reopening are disabled gracefully.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | for persistence | e.g. `mongodb://localhost:27019/plan-to-linear` |
| `LINEAR_API_KEY` | for shipping | Linear personal API key |
| `GIPHY_API_KEY` | no | memes on the Focus deck cards |
| `PORT` | no | API port (default 3001) |

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

Every card gets a **🤖 Copy prompt** button that turns the task into a self-contained prompt for an AI agent.

## API

REST under `/api/v1` with a standard envelope — success `{ "status": "ok", "message", "data" }`, error `{ "status": "error", "message", "details"? }`. Projects and their tasks are full CRUD; tasks are individually addressable:

```bash
# reword a task while someone reviews it — the app picks it up within 3 s
curl -X PATCH localhost:3001/api/v1/projects/$PID/tasks/$TID \
  -H 'content-type: application/json' \
  -d '{"todo":"New concrete steps."}'
```

Full endpoint reference lives in [CLAUDE.md](CLAUDE.md) (which doubles as the API doc for AI sessions). Deep link: `http://localhost:5173/?project=<id>` opens a project straight into review.

## Working with Claude

- [CLAUDE.md](CLAUDE.md) auto-loads in any Claude Code session in this repo — Claude can list, edit, and mark tasks done via the API with no extra setup; the review screen polls every 3 s and reflects external edits live.
- The `/yak-dai` skill ([.claude/skills/yak-dai](.claude/skills/yak-dai)) turns a goal or a whole conversation into a PRD + plan in the app's format, then **auto-creates the project and hands back the review URL**.
- Code conventions are enforced by two vendored skills: [vite-react-best-practices](.claude/skills/vite-react-best-practices) (frontend) and [express-typescript-api-best-practices](.claude/skills/express-typescript-api-best-practices) (server); repo-specific deviations are recorded in CLAUDE.md.

## Architecture

```
src/                      # React + Vite
├── App.tsx               # state container + lazy page switch (no router lib; URL mirrors state)
├── pages/                # Input, Projects, Review, Ship — one lazy chunk each
├── components/           # TaskCard, CardViewer (swipe deck), ThemeToggle
└── lib/api.ts            # ALL server calls (typed fetch wrappers)

server/                   # Express + TypeScript (tsx)
├── index.ts              # composition root
└── src/
    ├── v1/routes → controllers → services → repositories → models
    ├── schemas/          # Zod input validation (per-field 400 details)
    ├── middlewares/      # validate + central error-handler
    └── config/           # env + Mongo connection

shared/parse.ts           # plan markdown parser ⇄ serializer (used by both sides)
```

Two MongoDB collections: `projects` and `tasks` (`projectId` FK, `order`, cascade delete).

## Testing

```bash
npm test           # parser round-trip, service rules (in-memory fake repos), Zod schemas
npx tsc --noEmit   # typecheck
npm run build      # production bundle
```
