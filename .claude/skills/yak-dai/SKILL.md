---
name: yak-dai
description: Turn a goal — or a whole conversation — into a spec plus an implementation plan in the strict format the plan-to-linear app can split into Linear tasks. Runs the grilling → to-spec → to-tickets pipeline (no docs written), generates a mermaid architecture diagram and a structured spec JSON from the spec, then renders the tickets into the app's plan format and auto-creates the project (diagrams and spec included, tasks tagged with the diagram nodes and spec entries they touch). Use when the user invokes /yak-dai, asks to "write a plan for linear", "make a linear plan", "plan me a feature", gives a goal to break into tasks, wants pickup-ready tasks, or wants to convert a discussion/grilling session into tasks.
---

# Yak-dai (grill → spec → tickets → plan)

The user may give you anything from a one-line goal to a whole conversation's worth of context. Your job: sharpen it with an interview, synthesize a spec, break it into tickets, and render those tickets into the strict plan format below.

This skill chains four skills that live in `~/.agents/skills/` (Claude Code does not auto-discover that directory — read each `SKILL.md` by path when the step begins and follow it — and wherever a `~/.agents/skills/<name>/` path appears below, if that file does not exist, read `.agents/skills/<name>/` from the current repo instead, so this works whether the sub-skills are installed in your home dir or checked into the project):

## Workflow

1. **Interview with grilling.** Read and follow `~/.agents/skills/grilling/SKILL.md` (read by path, not slash-invoked) — a relentless interview that sharpens the plan: one question at a time, with a recommended answer each. Run it for big, fuzzy, or high-stakes goals, or whenever the user asks to be grilled. Skip the interview only when the conversation already contains the answers (e.g. converting a finished discussion) — never re-ask what's already settled, and never ask what's discoverable in the code. Do NOT write docs during or after the interview — no ADRs, no `CONTEXT.md`/glossary edits (skip the domain-modeling skill entirely); decisions live in the spec and the tasks, nowhere else.
2. **Summarize into a spec with to-spec.** Read and follow `~/.agents/skills/to-spec/SKILL.md` to synthesize the grilled conversation + codebase understanding into a spec — problem statement, solution, extensive user stories, implementation decisions, testing decisions, out of scope. No second interview. Use the repo's existing vocabulary and respect any existing ADRs. Output the spec as prose in the chat; do NOT publish it to any issue tracker — the plan-to-linear app is the tracker in this pipeline.
3. **Break into tickets with to-tickets.** Read and follow `~/.agents/skills/to-tickets/SKILL.md`: draft tracer-bullet vertical slices with blocking edges (expand–contract for wide refactors). SKIP to-tickets' "quiz the user" step — do NOT ask for approval of the breakdown; proceed straight to the next step. The user reviews tasks in the app and asks Claude for edits afterwards (applied via the task API, see step 7). Do NOT publish to `.scratch/` or a tracker — the tickets feed the next step instead.
4. **Mint the three project artifacts — flowchart, sequence diagram, spec JSON.** All three in ONE step, because that is what lets their ids line up: mint them separately and the spec ends up naming things the diagrams call something else. The app stores all three and shows a Flowchart / Sequence / Spec toggle on the review screen. Read `~/.agents/skills/mermaid-skill/SKILL.md` and follow it for the two diagrams:
   - **Flowchart** (`graph TD`): the components and the data flow between them, not the task list. Use short, stable, camelCase node ids (e.g. `web`, `apiServer`, `db`). It is read at a glance beside a task card, so it is a **map, not a call trace** — and mermaid's auto-layout cannot rescue a source that fights it. Author it under these constraints:
     - **Declare, then connect.** Every node is declared inside a `subgraph`, all subgraphs first, and only then a block of edges. Mermaid places nodes in declaration order, so a node born inside an edge line (`apiServer["Express API"] --> mongo[("MongoDB")]`) lands wherever that edge fell and drags its arrows across the picture.
     - **Group by tier: one `subgraph` per tier, 2-5 nodes each** — what the user touches, what runs, what stores, what is external. Name them plainly (`subgraph "Client"`). 5-12 nodes overall; more than 12 is a second diagram, not a denser one. Add `direction LR` inside a tier that is wider than it is tall.
     - **Edge budget: at most one more edge than nodes** (8 nodes → 9 edges max), and never more than 12. Over budget means you are drawing calls, and calls belong in the sequence diagram, which is minted in this same step for exactly that purpose.
     - **One edge per pair, one direction.** Never draw the response as a second arrow. Never draw a transitive shortcut: given `a --> b --> c`, an extra `a --> c` is banned.
     - **Collapse a fan-in of arrows that mean the same thing.** Three nodes pointing at one node for the same reason is one edge from the tier that owns them, not three long lines. Two arrows into the same node stay only when they mean different things (a read and a write). A helper used from everywhere (`shared/parse.ts`, a validator, a formatter) is **not a node at all** — it is an `interfaces` entry in the spec.
     - **At most 3 labelled edges, and 4 words each**, only where the label changes what the arrow means. Method, path and payload live in the spec's `api` entries — an arrow labelled `POST /issues + resolved slice` is spec detail smuggled into a picture.
     - **Node labels are 1-4 words, no file paths, no parenthetical asides.** `apiServer["Express API"]`, never `apiServer["Express API (server/src, validates with Zod)"]`.
     - **Self-check the source before using it.** Nothing renders a PNG in this pipeline, so the check is structural, on the text: count nodes and edges against the budget; every node sits in a subgraph; no pair connected twice; no transitive shortcut; at most 3 labelled edges. Fix the source and re-validate rather than shipping it and letting the reviewer squint.

     ```
     %% no — 8 nodes, 10 edges, no grouping, nodes born inside edges: mermaid scatters them
     graph TD
       planningSkill["Planning skill (/yak-dai, /yang-mai-sure)"] -->|"POST project + spec + specRefs"| apiServer
       apiServer["Express API (server/src)"] --> mongo[("MongoDB")]
       reviewPage["Review screen"] -->|"GET project (3s poll)"| apiServer
       taskCard -->|"copy prompt / review"| parseShared["shared/parse.ts"]

     %% yes — tiers first, then edges; the helper moved to the spec; labels off the arrows
     graph TD
       subgraph "Client"
         reviewPage["Review screen"]
         taskCard["Task card"]
         specPanel["Spec tab"]
         shipPage["Ship screen"]
       end
       subgraph "Server"
         apiServer["Express API"]
       end
       subgraph "Data"
         mongo[("MongoDB")]
       end
       subgraph "External"
         planningSkill["Planning skill"]
         linear["Linear"]
       end

       planningSkill --> apiServer
       reviewPage --> taskCard
       reviewPage --> specPanel
       reviewPage -->|"3s poll"| apiServer
       shipPage --> apiServer
       apiServer --> mongo
       apiServer --> linear
     ```
   - **Sequence diagram** (`sequenceDiagram`): the main runtime flow(s) through those same components. Declare every participant as `participant <sameCamelCaseId> as <display label>` — participant ids MUST reuse the flowchart's node ids verbatim, because the app highlights both diagrams by those ids (flowchart nodes glow; sequence messages between the task's participants light up while the rest dims).
   - Validate BOTH diagram sources before use (mermaid-skill's validation-first rule — Kroki or local `mmdc`; no PNG export needed).
   - **Spec JSON**: the structured extract of the spec's **Implementation Decisions** — schema changes, API contracts, module interfaces. It is a **review-time artifact only**: it never leaves the app, so it is never a substitute for a task's own `### What to do`. A task that reads as "implement the spec entries" is a broken task — spell the work out in the task, and let the spec be the map the reviewer reads alongside it. Shape is `Record<section, Entry[]>`:
     - Sections are **open**: `dataModels`, `api` and `interfaces` are the typical ones, not a closed list. Add a section when the decisions call for one; leave one out when they don't.
     - Every entry carries a camelCase `id` **unique across the whole spec**, not just within its section — a task names entries bare, so a repeat makes the reference ambiguous (the API rejects it with 400).
     - Everything else on an entry is free-form: write whatever the decision actually says (`name`, `fields`, `method`, `path`, `returns`, `notes`, …). Nothing inspects these keys, so never flatten a decision to fit a shape.
     - **An entry that maps 1:1 to a flowchart node reuses that node's id verbatim** — the `apiServer` node and the `apiServer` interface entry are the same thing under one name. Only mint a new id where there is no such node (individual models, individual endpoints).
     - **Write structure AS structure, never as a sentence describing it.** Anything with repeating parts — a model's fields, an endpoint's params, a list of call sites — is a nested array of objects, not a string that merely looks like one. The review screen prints nested values as indented JSON and never parses prose, so a pseudo-JSON string renders as a single unreadable run-on line. Prose belongs under `notes`, where prose IS the content.

       ```json
       // yes — the panel indents this
       { "id": "specs", "name": "Spec document", "collection": "specs",
         "fields": [
           { "name": "projectId", "type": "ObjectId", "notes": "unique, indexed, ref Project" },
           { "name": "sections", "type": "Mixed" }
         ],
         "notes": "One document per project." }

       // no — one long line on screen, and nothing can reflow it
       { "id": "specs", "shape": "{ projectId: ObjectId (unique, indexed, ref Project), sections: Mixed }" }
       ```
     - **An `api` entry carries the whole contract: `method`, `path`, request `body` AND `response`.** `method` + `path` say where to knock, not what to send or what comes back — and this entry is what the reviewer reads in the Spec tab while judging whether the tasks add up. Write both shapes as nested JSON (same rule as above), and the literal `"none"` where a method has no body. Say so explicitly when a contract is unchanged; "UNCHANGED" without the shape still leaves the reader hunting.

       ```json
       { "id": "putProjectSpec", "method": "PUT", "path": "/api/v1/projects/:id",
         "body": { "spec": "Spec — merged field-wise; omitting `tasks` leaves them untouched" },
         "response": { "status": "ok", "message": "string", "data": "Project + tasks" },
         "errors": [{ "status": 400, "when": "an entry id repeats anywhere in the spec" }] }
       ```
   - Then tag every ticket with **both** the flowchart node ids AND the spec entry ids it touches. Either list may be empty — a docs-only ticket touches no node, a pure-refactor ticket may implement no spec entry. Tag **node ids only, never a subgraph title**: the review screen glows individual nodes, so a tier name either matches nothing or tints the whole group.
5. **Render the tickets into the plan format below**, one `## Task:` block per ticket, ordered blockers-first (execution order):
   - Ticket title → `## Task:` title (imperative, unique). Blocking edges → `### Depends on` lines, each with a concrete blocking reason.
   - **Carry over everything the ticket and spec know — nothing from a ticket's description may be dropped.** The ticket's "what to build" and the spec's problem context become `### Problem` (ending with a concrete `Scenario:` line). The spec's implementation decisions for this slice become `### What to do` as detailed concrete steps — and unlike tracker tickets, real file paths, commands, and APIs are REQUIRED here, not avoided: each card doubles as a self-contained agent prompt, so staleness loses to completeness. The ticket's acceptance criteria and demoable behaviour become `### Expected outcome`, ending with `Before:`/`After:` lines replaying the scenario.
   - Every task must satisfy the Rules section below; a spec decision or ticket detail that lands in no task is lost.
6. **Auto-create the project and return its review link.** After outputting the plan, create it in the plan-to-linear app so the user can start reviewing without pasting:
   - API base: `http://localhost:3001` (`npm run dev`); if unreachable, fall back to `http://localhost:5173` (docker compose publishes only the web proxy).
   - `POST <base>/api/v1/projects` with JSON `{ "title": <text after "# Plan:">, "diagram": <flowchart source from step 4>, "sequenceDiagram": <sequence source from step 4>, "spec": <spec JSON from step 4>, "tasks": [{ "title", "problem", "todo", "outcome", "dependsOn": [{ "title", "reason" }], "diagramNodes": [<node ids from step 4>], "specRefs": [<spec entry ids from step 4>] }] }` — one entry per `## Task:` block, section texts verbatim (keep `Scenario:`/`Before:`/`After:` lines inside their sections). Skip any task missing a required section. If working inside the plan-to-linear repo, prefer parsing with its own `parsePlan` from `shared/parse.ts` (via `npx tsx`) over hand-building the JSON — then merge `diagram`/`sequenceDiagram`/`spec`/`diagramNodes`/`specRefs` into the parsed payload (the markdown format carries none of them).
   - Responses use an envelope `{ status, message, data }`. On 201, give the user the review link: `http://localhost:5173/?project=<id from response data.id>` — it opens the project directly in review.
   - If the API is down or returns 503 (Mongo not configured), skip without retrying and tell the user to paste the `# Plan:` block into the app manually.
7. **Edit on request, via the API.** After the project exists, any change the user asks for (reword a task, add/remove/reorder tasks, fix the diagram) is applied directly with the project/task API from `CLAUDE.md` — prefer `PATCH .../tasks/:taskId` for single-task edits so live `done` flags aren't disturbed; use `POST .../tasks` / `DELETE .../tasks/:taskId` for add/remove, and `PUT` with full `tasks` only for wholesale restructuring. Never make the user paste an updated plan — the review screen polls every 3 s and picks up API edits automatically.
   - **Keep the spec in step with the tasks.** When an edit adds, renames or removes something the spec records — a model, a field, an endpoint, an interface — update the spec in the SAME turn with a spec-only `PUT /projects/:id { "spec": <full updated spec> }`, and fix the affected tasks' `specRefs` with `PATCH`. This is safe mid-review because only `tasks` is destructive on a PUT: every other field merges on its own and leaves the tasks (and their live `done` flags) untouched. A spec that drifts from the tasks is worse than no spec — the review screen presents it as fact while the user decides what to ship.
   - This standing rule is for the **spec only**. Leave the diagrams alone unless the user asks for a diagram change: they describe the architecture, not the ticket list, and a reworded task rarely moves a box.

## Format

Write the plan as markdown in EXACTLY this structure — the app parses it deterministically, so headings must match verbatim:

```markdown
# Plan: <short plan title>

## Task: <imperative task title>
### Problem
<why this task exists — the pain or gap, 1-3 sentences>
Scenario: <a concrete example a reader can picture — a named user does X, and today Y (the wrong thing) happens>
### What to do
<detailed concrete steps, file paths, commands — enough for someone with zero context; number the steps if there are more than two>
### Expected outcome
<a verifiable end state: what to run/check to confirm it's done>
Before: <what happens today in the scenario above>
After: <what happens once this task is done — same scenario, fixed result>
### Depends on
- <exact task title> — <one line: what concretely breaks or blocks in THIS task if that dependency is not done first>
<optional section — one line per dependency; omit the section entirely when none>
```

Repeat the `## Task:` block for every task. Prose outside task blocks is ignored by the parser. Backtick inline code (file paths, function names) — the app renders it as code.

## Rules

- Every task must be **self-contained**: a teammate (or their AI agent) picks up one task with no other context and can finish it. Repeat context in each task rather than referencing "the task above".
- Every task doubles as an **agent prompt**: the app generates a per-task "🤖 Copy prompt" (which directs the agent to the `implement` skill in `~/.agents/skills/`) and a "🔍 Copy review" (the `code-review` skill, with the task as the spec) verbatim from Problem + What to do + Expected outcome. Do NOT embed prompt text in the plan; instead write those three sections concretely enough that an AI agent given only them (plus dependency titles) can complete and verify the task.
- **Problem** states why, not what, and always ends with a `Scenario:` line — one concrete, specific example (real user role, real action, real wrong result). "Scenario: a Team-A editor opens /articles?teamId=team-b and sees Team B's drafts" — never "users see wrong data".
- **What to do** names real files, commands, and APIs — not "implement the feature". Be generous with detail: exact functions to call, exact places to change, edge cases to handle.
- **Expected outcome** must be checkable, and always ends with `Before:` and `After:` lines replaying the Problem's scenario — the same action, showing today's result vs the result once done. Not "it works better".
- 3–10 tasks per plan. Bigger than 10 → the plan is too big, split the plan itself.
- Task titles are imperative and unique ("add welcome email", not "email stuff").
- Order tasks by execution order — order is the default dependency. Add `### Depends on` only for hard prerequisites, listing exact task titles from this plan (the app links them as "blocked by" in Linear); never reference a task outside this plan.
- A dependency added for tidiness, or to avoid rework, is NOT a blocker — and it is not free. The review screen groups tasks into independent tracks by these edges (connected components of the dependency graph), so one soft edge merges two tracks into one and hides work two people could have picked up in parallel. If a task could technically start before another finishes, leave the edge out and let plan order carry the sequence.
- Every dependency line must carry a blocking reason after ` — `: state what concretely fails in this task without it ("without the `username` column, `/u/:username` has nothing to resolve and every route 404s"), never a vague "needs it first". The app shows this reason on the card so a picker knows why they must wait.
