---
name: linear-plan
description: Turn a goal — or a whole conversation — into a PRD plus an implementation plan in the strict format the plan-to-linear app can split into Linear tasks. Use when the user asks to "write a plan for linear", "make a linear plan", "plan me a feature", gives a goal to break into tasks, wants pickup-ready tasks, or wants to convert a discussion/grill-me session into tasks.
---

# Linear plan (PRD-core)

The user may give you anything from a one-line goal to a whole conversation's worth of context. Your job: synthesize a PRD, then decompose it into tasks in the strict format below.

Core method adapted from [mattpocock's to-prd skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-prd/SKILL.md).

## Workflow

1. **Synthesize, don't interview.** Explore the repo if you haven't already, then draft a compact PRD from what the conversation and codebase already contain. Do NOT ask about things already discussed or discoverable in code. PRD sections:
   - **Problem statement** — the problem from the user's perspective.
   - **Solution** — the solution from the user's perspective.
   - **User stories** — a numbered, extensive list: "As an <actor>, I want <feature>, so that <benefit>".
   - **Implementation decisions** — modules to build/modify, interfaces, architecture, schema/API contracts. Prose over file paths and code dumps; inline a snippet only when it encodes a decision more precisely than prose (type shape, schema, state machine) — trim to the decision-rich part.
   - **Testing decisions** — what makes a good test here (external behavior, not implementation details), which modules get tested, prior art in the codebase.
   - **Out of scope** — what this plan deliberately does not cover.
2. **Ask only to fill gaps.** If a genuine gap remains that changes the tasks and isn't answerable from context, ask 1–3 questions with AskUserQuestion. For big, fuzzy, or high-stakes goals — or when the user says "grill me" — invoke the `grill-me` skill instead; its resolved branches feed the PRD's decisions. If the conversation is already rich, ask nothing.
3. **Decompose the PRD into tasks** in the exact format below. Every task must trace to at least one user story. Implementation decisions land in "What to do"; Testing decisions shape "Expected outcome"; nothing from Out of scope becomes a task. A decision that never lands in a task is lost.
4. **Output both**: the PRD as prose first, then the `# Plan:` block ready to paste into the app.

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
- Every task doubles as an **agent prompt**: the app generates a per-task "🤖 Copy prompt" (which forces the ponytail skill — simplest working solution) verbatim from Problem + What to do + Expected outcome. Do NOT embed prompt text in the plan; instead write those three sections concretely enough that an AI agent given only them (plus dependency titles) can complete and verify the task.
- **Problem** states why, not what, and always ends with a `Scenario:` line — one concrete, specific example (real user role, real action, real wrong result). "Scenario: a Team-A editor opens /articles?teamId=team-b and sees Team B's drafts" — never "users see wrong data".
- **What to do** names real files, commands, and APIs — not "implement the feature". Be generous with detail: exact functions to call, exact places to change, edge cases to handle.
- **Expected outcome** must be checkable, and always ends with `Before:` and `After:` lines replaying the Problem's scenario — the same action, showing today's result vs the result once done. Not "it works better".
- 3–10 tasks per plan. Bigger than 10 → the plan is too big, split the plan itself.
- Task titles are imperative and unique ("add welcome email", not "email stuff").
- Order tasks by execution order — order is the default dependency. Add `### Depends on` only for hard prerequisites, listing exact task titles from this plan (the app links them as "blocked by" in Linear); never reference a task outside this plan.
- Every dependency line must carry a blocking reason after ` — `: state what concretely fails in this task without it ("without the `username` column, `/u/:username` has nothing to resolve and every route 404s"), never a vague "needs it first". The app shows this reason on the card so a picker knows why they must wait.
