import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSeqTags } from './seqtags.ts'

test('strips a trailing tag and records it', () => {
  const { source, tags } = parseSeqTags(`sequenceDiagram
  web->>apiServer: create project [postProjects]`)
  assert.equal(source, `sequenceDiagram
  web->>apiServer: create project`)
  assert.deepEqual(tags, ['postProjects'])
})

test('an untagged message keeps its line and gets a null slot', () => {
  const src = `sequenceDiagram
  apiServer->>db: insertOne`
  assert.deepEqual(parseSeqTags(src), { source: src, tags: [null] })
})

test('mixed diagram: one slot per message, in source order, other lines byte-for-byte', () => {
  const { source, tags } = parseSeqTags(`sequenceDiagram
  %% a comment [notATag]
  participant web as Web app
  participant api as API

    web->>api: create [postProjects]
  api-->>web: 201
  api--)web: async [pushEvent]   `)
  assert.equal(source, `sequenceDiagram
  %% a comment [notATag]
  participant web as Web app
  participant api as API

    web->>api: create
  api-->>web: 201
  api--)web: async`)
  assert.deepEqual(tags, ['postProjects', null, 'pushEvent'])
})

test('a self-message is one message statement', () => {
  const { tags } = parseSeqTags(`sequenceDiagram
  diagramPanel->>diagramPanel: decorateMessages(svg, tags) [decorateMessages]`)
  assert.deepEqual(tags, ['decorateMessages'])
})

test('messages nested in loop / alt blocks count; the block keywords do not', () => {
  const { tags } = parseSeqTags(`sequenceDiagram
  loop every 3 s
    web->>api: poll [getProject]
  end
  alt changed
    api-->>web: project
  else unchanged
    api-->>web: same [getProject]
  end`)
  assert.deepEqual(tags, ['getProject', null, 'getProject'])
})

test('Note and participant lines get no tags slot, even with brackets or colons', () => {
  const src = `sequenceDiagram
  participant a as A [x]
  actor b
  Note over a: fat hit line [notATag]
  note right of b: also not [aTag]
  a->>b: hi`
  const { source, tags } = parseSeqTags(src)
  assert.equal(source, src)
  assert.deepEqual(tags, [null])
})

test('a bracket group that is not trailing stays in the label', () => {
  const src = `sequenceDiagram
  a->>b: read [draft] notes`
  assert.deepEqual(parseSeqTags(src), { source: src, tags: [null] })
})

test('only the last trailing group is the tag; an earlier one stays as label text', () => {
  const { source, tags } = parseSeqTags(`sequenceDiagram
  a->>b: list [v2] [listItems]`)
  assert.equal(source, `sequenceDiagram
  a->>b: list [v2]`)
  assert.deepEqual(tags, ['listItems'])
})

test('labels with braces, commas and arrow-like text survive; activation markers are accepted', () => {
  const { source, tags } = parseSeqTags(`sequenceDiagram
  seqtags-->>+diagramPanel: { source, tags } [parseSeqTags]
  diagramPanel->>-specHoverCard: pointerenter -> open(specId, rect) [specHoverCard]
  diagramPanel->>mermaid: render(strippedSource)`)
  assert.equal(source, `sequenceDiagram
  seqtags-->>+diagramPanel: { source, tags }
  diagramPanel->>-specHoverCard: pointerenter -> open(specId, rect)
  diagramPanel->>mermaid: render(strippedSource)`)
  assert.deepEqual(tags, ['parseSeqTags', 'specHoverCard', null])
})

test('every mermaid arrow form is a message', () => {
  const arrows = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>', '<<-->>']
  const { tags } = parseSeqTags(['sequenceDiagram', ...arrows.map((a, i) => `  a${a}b: m${i} [t${i}]`)].join('\n'))
  assert.deepEqual(tags, arrows.map((_, i) => `t${i}`))
})

test('empty and flowchart sources pass through with no tags', () => {
  assert.deepEqual(parseSeqTags(''), { source: '', tags: [] })
  const flow = `flowchart LR
  web -->|create [postProjects]| api`
  assert.deepEqual(parseSeqTags(flow), { source: flow, tags: [] })
})

test('spaces around the arrow and multi-word participant names are still messages', () => {
  const { source, tags } = parseSeqTags(`sequenceDiagram
  web ->> api: create [postProjects]
  Alice Smith->>Bob: hi [greet]
  Bob -->> Alice Smith : back`)
  assert.equal(source, `sequenceDiagram
  web ->> api: create
  Alice Smith->>Bob: hi
  Bob -->> Alice Smith : back`)
  assert.deepEqual(tags, ['postProjects', 'greet', null])
})

test('an init directive or frontmatter before the diagram keyword is skipped', () => {
  for (const header of ['%%{init: {"theme": "dark"}}%%', '---\ntitle: Billing\n---', '%% just a comment']) {
    const { source, tags } = parseSeqTags(`${header}\nsequenceDiagram\n  a->>b: x [t1]`)
    assert.equal(source, `${header}\nsequenceDiagram\n  a->>b: x`)
    assert.deepEqual(tags, ['t1'])
  }
})

test('tag ids may contain hyphens and dots', () => {
  assert.deepEqual(parseSeqTags(`sequenceDiagram\n  a->>b: x [post-projects.v2]`).tags, ['post-projects.v2'])
})
