---
name: yang-mai-sure
description: Like /yak-dai but for efforts you're NOT SURE about yet — too big or foggy for one interview session. Instead of a single grilling interview, it charts and works a wayfinder map (investigation tickets on the issue tracker) until the way is clear, then runs the same to-spec → to-tickets → mermaid diagram → auto-create pipeline into the plan-to-linear app. Use when the user invokes /yang-mai-sure, brings a loose idea bigger than one session can hold, says "ยังไม่ชัวร์" / "not sure yet how to build this", or wants to map out unknowns before planning.
---

# Yang-mai-sure (wayfind → spec → tickets → plan)

Same destination as `/yak-dai` — a reviewed plan in the plan-to-linear app — but for ideas still wrapped in fog: too big, too many open decisions for one grilling interview. Instead of interviewing in one sitting, chart the unknowns as a **wayfinder map** and resolve them ticket by ticket; once the way is clear, the rest of the pipeline is identical to yak-dai.

This skill chains skills that live in `.agents/skills/` (Claude Code does not auto-discover that directory — read each `SKILL.md` by path when the step begins and follow it):

## Workflow

1. **Find the way with wayfinder.** Read and follow `.agents/skills/wayfinder/SKILL.md`. This replaces yak-dai's grilling interview:
   - **First invocation** (loose idea): chart the map — name the destination, map the frontier breadth-first, create the map + tickets on the issue tracker. Then stop; charting is one session's work.
   - **Later invocations** (map exists): work through the map — claim one frontier ticket, resolve it, record the decision. **Never more than one ticket per session** (wayfinder's rule).
   - If charting surfaces **no fog** — the way is already clear — skip the map and tell the user to run `/yak-dai` instead; this skill's overhead isn't needed.
   - Wayfinder's tracker artifacts (map + tickets) are the deliberate exception to the no-docs rule below: they ARE the interview record. Still no ADRs, no `CONTEXT.md`/glossary edits outside what wayfinder itself prescribes.
2. **When the map is done** — no open tickets remain and the way to the destination is clear — continue in that same session with the rest of the yak-dai pipeline, using the map's **Decisions so far** (zooming into closed tickets as needed) as the grilled conversation:
3. **Summarize into a spec with to-spec.** Read and follow `.agents/skills/to-spec/SKILL.md` to synthesize the map's decisions + codebase understanding into a spec — problem statement, solution, extensive user stories, implementation decisions, testing decisions, out of scope (seed it from the map's Out of scope section). No new interview — every decision is already on the map. Output the spec as prose in the chat; do NOT publish it anywhere — the plan-to-linear app is the tracker for the plan.
4. **Break into tickets with to-tickets.** Read and follow `.agents/skills/to-tickets/SKILL.md`: draft tracer-bullet vertical slices with blocking edges (expand–contract for wide refactors). SKIP to-tickets' "quiz the user" step — the user reviews tasks in the app and asks Claude for edits afterwards (applied via the task API, step 8). Do NOT publish to `.scratch/` or a tracker — these tickets feed the next step. (They are separate from wayfinder's investigation tickets, which stay closed on the tracker as the decision record.)
5. **Generate BOTH project diagrams** — identical to `/yak-dai` step 4: a flowchart (`graph TD`, camelCase node ids) AND a sequence diagram (`sequenceDiagram`, participant ids reusing the flowchart's node ids verbatim), both validated (Kroki or local `mmdc`), from `.agents/skills/mermaid-skill/SKILL.md`. Then tag every ticket with the node ids it touches (an empty list is fine); one id set drives highlighting in both diagrams.
6. **Render the tickets into the plan format** — identical to `/yak-dai` step 5: read `.claude/skills/yak-dai/SKILL.md`'s **Format** and **Rules** sections and follow them verbatim (one `## Task:` block per ticket, blockers-first, self-contained, `Scenario:`/`Before:`/`After:` lines, concrete file paths).
7. **Auto-create the project and return its review link** — identical to `/yak-dai` step 6: `POST <base>/api/v1/projects` (base `http://localhost:3001`, fallback `http://localhost:5173`) with `{ title, diagram, sequenceDiagram, tasks: [{ title, problem, todo, outcome, dependsOn, diagramNodes }] }`; prefer parsing with `parsePlan` from `shared/parse.ts` when inside this repo, then merge `diagram`/`sequenceDiagram`/`diagramNodes` in. On 201 give the user `http://localhost:5173/?project=<data.id>`. If the API is down or 503, tell the user to paste the `# Plan:` block manually.
8. **Edit on request, via the API** — identical to `/yak-dai` step 7: apply changes with the project/task API from `CLAUDE.md`, preferring `PATCH .../tasks/:taskId`; never make the user paste an updated plan.

## Rules

- The plan format, task rules, and API contract are yak-dai's — this skill only swaps the interview for wayfinding. When in doubt at steps 6–8, defer to `.claude/skills/yak-dai/SKILL.md`.
- Respect wayfinder's session discipline: chart OR one ticket per session. Only the session that closes the last ticket rolls on into spec → plan.
- HITL tickets (grilling, prototype) are worked with the live human — never answer your own questions.
