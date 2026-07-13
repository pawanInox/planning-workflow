---
name: yak-dai
description: Turn a goal — or a whole conversation — into a spec plus an implementation plan in the strict format the plan-to-linear app can split into Linear tasks. Runs the grilling → to-spec → to-tickets pipeline (no docs written), generates a mermaid architecture diagram from the spec, then renders the tickets into the app's plan format and auto-creates the project (diagram included, tasks tagged with the diagram nodes they touch). Use when the user invokes /yak-dai, asks to "write a plan for linear", "make a linear plan", "plan me a feature", gives a goal to break into tasks, wants pickup-ready tasks, or wants to convert a discussion/grilling session into tasks.
---

# Yak-dai (grill → spec → tickets → plan)

The user may give you anything from a one-line goal to a whole conversation's worth of context. Your job: sharpen it with an interview, synthesize a spec, break it into tickets, and render those tickets into the strict plan format below.

This skill chains four skills that live in `.agents/skills/` (Claude Code does not auto-discover that directory — read each `SKILL.md` by path when the step begins and follow it):

## Workflow

1. **Interview with grilling.** Read and follow `.agents/skills/grilling/SKILL.md` (read by path, not slash-invoked) — a relentless interview that sharpens the plan: one question at a time, with a recommended answer each. Run it for big, fuzzy, or high-stakes goals, or whenever the user asks to be grilled. Skip the interview only when the conversation already contains the answers (e.g. converting a finished discussion) — never re-ask what's already settled, and never ask what's discoverable in the code. Do NOT write docs during or after the interview — no ADRs, no `CONTEXT.md`/glossary edits (skip the domain-modeling skill entirely); decisions live in the spec and the tasks, nowhere else.
2. **Summarize into a spec with to-spec.** Read and follow `.agents/skills/to-spec/SKILL.md` to synthesize the grilled conversation + codebase understanding into a spec — problem statement, solution, extensive user stories, implementation decisions, testing decisions, out of scope. No second interview. Use the repo's existing vocabulary and respect any existing ADRs. Output the spec as prose in the chat; do NOT publish it to any issue tracker — the plan-to-linear app is the tracker in this pipeline.
3. **Break into tickets with to-tickets.** Read and follow `.agents/skills/to-tickets/SKILL.md`: draft tracer-bullet vertical slices with blocking edges (expand–contract for wide refactors). SKIP to-tickets' "quiz the user" step — do NOT ask for approval of the breakdown; proceed straight to the next step. The user reviews tasks in the app and asks Claude for edits afterwards (applied via the task API, see step 7). Do NOT publish to `.scratch/` or a tracker — the tickets feed the next step instead.
4. **Generate the project diagram.** Read `.agents/skills/mermaid-skill/SKILL.md` and follow it to write a mermaid flowchart (`graph TD`) of the system from the spec's implementation decisions — components and data flow, not the task list. Use short, stable, camelCase node ids (e.g. `web`, `apiServer`, `db`); the app highlights nodes by these ids, so never rename them between steps. Validate the syntax before use (mermaid-skill's validation-first rule — Kroki or local `mmdc`; no PNG export needed). Then tag every ticket with the node ids it touches (an empty list is fine). The review screen renders this diagram and glows the active task's nodes.
5. **Render the tickets into the plan format below**, one `## Task:` block per ticket, ordered blockers-first (execution order):
   - Ticket title → `## Task:` title (imperative, unique). Blocking edges → `### Depends on` lines, each with a concrete blocking reason.
   - **Carry over everything the ticket and spec know — nothing from a ticket's description may be dropped.** The ticket's "what to build" and the spec's problem context become `### Problem` (ending with a concrete `Scenario:` line). The spec's implementation decisions for this slice become `### What to do` as detailed concrete steps — and unlike tracker tickets, real file paths, commands, and APIs are REQUIRED here, not avoided: each card doubles as a self-contained agent prompt, so staleness loses to completeness. The ticket's acceptance criteria and demoable behaviour become `### Expected outcome`, ending with `Before:`/`After:` lines replaying the scenario.
   - Every task must satisfy the Rules section below; a spec decision or ticket detail that lands in no task is lost.
6. **Auto-create the project and return its review link.** After outputting the plan, create it in the plan-to-linear app so the user can start reviewing without pasting:
   - API base: `http://localhost:3001` (`npm run dev`); if unreachable, fall back to `http://localhost:5173` (docker compose publishes only the web proxy).
   - `POST <base>/api/v1/projects` with JSON `{ "title": <text after "# Plan:">, "diagram": <the mermaid source from step 4>, "tasks": [{ "title", "problem", "todo", "outcome", "dependsOn": [{ "title", "reason" }], "diagramNodes": [<node ids from step 4>] }] }` — one entry per `## Task:` block, section texts verbatim (keep `Scenario:`/`Before:`/`After:` lines inside their sections). Skip any task missing a required section. If working inside the plan-to-linear repo, prefer parsing with its own `parsePlan` from `shared/parse.ts` (via `npx tsx`) over hand-building the JSON — then merge `diagram`/`diagramNodes` into the parsed payload (the markdown format doesn't carry them).
   - Responses use an envelope `{ status, message, data }`. On 201, give the user the review link: `http://localhost:5173/?project=<id from response data.id>` — it opens the project directly in review.
   - If the API is down or returns 503 (Mongo not configured), skip without retrying and tell the user to paste the `# Plan:` block into the app manually.
7. **Edit on request, via the API.** After the project exists, any change the user asks for (reword a task, add/remove/reorder tasks, fix the diagram) is applied directly with the project/task API from `CLAUDE.md` — prefer `PATCH .../tasks/:taskId` for single-task edits so live `done` flags aren't disturbed; use `POST .../tasks` / `DELETE .../tasks/:taskId` for add/remove, and `PUT` with full `tasks` only for wholesale restructuring. Never make the user paste an updated plan — the review screen polls every 3 s and picks up API edits automatically.

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
- Every task doubles as an **agent prompt**: the app generates a per-task "🤖 Copy prompt" (which directs the agent to the `implement` skill in `.agents/skills/`) and a "🔍 Copy review" (the `code-review` skill, with the task as the spec) verbatim from Problem + What to do + Expected outcome. Do NOT embed prompt text in the plan; instead write those three sections concretely enough that an AI agent given only them (plus dependency titles) can complete and verify the task.
- **Problem** states why, not what, and always ends with a `Scenario:` line — one concrete, specific example (real user role, real action, real wrong result). "Scenario: a Team-A editor opens /articles?teamId=team-b and sees Team B's drafts" — never "users see wrong data".
- **What to do** names real files, commands, and APIs — not "implement the feature". Be generous with detail: exact functions to call, exact places to change, edge cases to handle.
- **Expected outcome** must be checkable, and always ends with `Before:` and `After:` lines replaying the Problem's scenario — the same action, showing today's result vs the result once done. Not "it works better".
- 3–10 tasks per plan. Bigger than 10 → the plan is too big, split the plan itself.
- Task titles are imperative and unique ("add welcome email", not "email stuff").
- Order tasks by execution order — order is the default dependency. Add `### Depends on` only for hard prerequisites, listing exact task titles from this plan (the app links them as "blocked by" in Linear); never reference a task outside this plan.
- Every dependency line must carry a blocking reason after ` — `: state what concretely fails in this task without it ("without the `username` column, `/u/:username` has nothing to resolve and every route 404s"), never a vague "needs it first". The app shows this reason on the card so a picker knows why they must wait.
