// Spec tags on sequence-diagram messages: `web->>apiServer: create project [postProjects]`.
// The trailing `[id]` names a spec entry; it is stripped before mermaid renders, and its position
// among the message statements is what pairs it with the rendered arrow. Pure and DOM-free so it
// can be unit-tested — the only tested seam of the arrow-hover feature.

// Lines starting with these are diagram structure, never messages (messages INSIDE a loop/alt/par
// block are still messages — only the block's own keyword line is excluded).
const KEYWORDS = new Set([
  'participant', 'actor', 'Note', 'note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'end', 'rect',
  'activate', 'deactivate', 'autonumber', 'title', 'box', 'critical', 'option', 'break', 'link', 'links',
])

// Longest arrows first: at one position the regex takes the first alternative that matches, so
// `-->>` must be tried before `->`. An optional `+`/`-` activation marker may follow the arrow.
const ARROW = '(?:<<-->>|<<->>|-->>|->>|--x|-x|--\\)|-\\)|-->|->)'
// `<from><arrow><to>:` — the label is everything after this. Names may contain spaces
// (`Alice Smith->>Bob`) and the arrow may be spaced (`web ->> api`); the lazy name stops at the FIRST
// arrow, so arrow-like text INSIDE the label (`pointerenter -> open(…)`) stays label text.
const MESSAGE_HEAD = new RegExp(`^\\s*[^:]+?\\s*${ARROW}[+-]?\\s*[^:]+?\\s*:`)
// only the LAST bracket group, and only when flush against end-of-line, is a tag
const TAG = /\s*\[([\w.-]+)\]\s*$/

/**
 * Strips trailing `[specEntryId]` tags from sequence message labels.
 * `tags[i]` belongs to the i-th message statement in source order — the order mermaid emits its
 * message elements in. A self-message (`a->>a: x`) is one statement even though mermaid draws it
 * as a `<path>` rather than a `<line>`. Every line that carried no tag is returned byte-for-byte.
 */
export function parseSeqTags(source: string): { source: string; tags: (string | null)[] } {
  const lines = source.split('\n')
  // the diagram keyword may follow `---` frontmatter, `%%{init}%%` directives or `%%` comments
  let i = 0
  if (lines[0]?.trim() === '---') { i = lines.findIndex((l, n) => n > 0 && l.trim() === '---') + 1; if (i === 0) return { source, tags: [] } }
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith('%%'))) i++
  if (!/^sequenceDiagram\b/.test(lines[i]?.trim() ?? '')) return { source, tags: [] }
  const tags: (string | null)[] = []
  const out = lines.map((line, n) => {
    if (n <= i) return line // the header and the keyword line itself
    const word = line.trim().split(/\s+/, 1)[0].replace(/:$/, '')
    if (!word || word.startsWith('%%') || KEYWORDS.has(word)) return line
    const head = line.match(MESSAGE_HEAD)?.[0]
    if (head === undefined) return line
    const label = line.slice(head.length)
    const tag = label.match(TAG)
    tags.push(tag ? tag[1] : null)
    return tag ? head + label.slice(0, tag.index) : line
  })
  return { source: out.join('\n'), tags }
}
