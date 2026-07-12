# plan-to-linear

Turns a markdown plan into reviewable task cards and ships them to Linear; projects and tasks persist in MongoDB.

## Language

**Plan**:
The markdown document a user pastes or Claude generates — `# Plan:` title plus `## Task:` blocks. The source format, not the stored record.
_Avoid_: spec, document

**Project**:
A persisted plan — one MongoDB document plus its tasks — reviewable at `/?project=<id>`.
_Avoid_: plan (once saved), board

**Task**:
One reviewable unit inside a project: title, problem, todo, outcome, dependsOn, done. Ships as one Linear issue.
_Avoid_: ticket, card (card is the UI rendering of a task)

**Diagram**:
The project's architecture flowchart — mermaid source generated from the spec at planning time and stored on the project. The app never generates it, only renders it.
_Avoid_: chart, graph

**Diagram nodes**:
The mermaid node ids a task touches — stored per task so the app can highlight where that task sits in the diagram.
_Avoid_: highlights, markers

**Review**:
The screen where a user works through a project's tasks (Focus deck or List) and marks them done.
_Avoid_: board view
