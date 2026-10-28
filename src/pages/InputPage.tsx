import type { Task } from '../../shared/parse'
import { CopyButton } from '../components/TaskCard'
import { pad } from '../lib/ui'
import { Icon } from '../components/Icon'

const FORMAT_PROMPT = `Reformat the plan below into EXACTLY this markdown structure (a parser reads it, so headings must match verbatim):

# Plan: <short plan title>

## Task: <imperative task title>
### Problem
<why this task exists, 1-3 sentences>
Scenario: <one concrete example — a real role does X, and today Y (the wrong thing) happens>
### What to do
<detailed concrete steps, real file paths and commands, enough for someone with zero context>
### Expected outcome
<a verifiable end state>
Before: <what happens today in the scenario above>
After: <what happens once done — same scenario, fixed result>
### Depends on
- <exact title of another task in this plan> — <one line: what concretely breaks in THIS task if that dependency is not done first>
(optional section — one line per dependency; omit entirely when none)

Rules: repeat the "## Task:" block per task; every task self-contained (repeat context, never say "the task above"); task titles imperative and unique; order tasks by execution order; 3-10 tasks; wrap file paths and function names in backticks; keep the original language of the plan for all content, but the headings and the words "Scenario:", "Before:", "After:" must stay in English exactly as shown.

IMPORTANT — output format: reply with ONE fenced code block starting with \`\`\`markdown and ending with \`\`\`, containing the entire formatted plan as raw markdown, and NOTHING outside the code block (no intro, no explanation). The user will copy the block's contents verbatim into an app that parses these exact headings.

Here is the plan to reformat:

`

export function InputPage({ md, tasks, onMdChange, onStartReview, onBackToReview, onMenu }: {
  md: string
  tasks: Task[]
  onMdChange: (value: string) => void
  onStartReview: () => void
  /** set while the markdown still matches a saved project, so review can resume without re-saving */
  onBackToReview?: () => void
  onMenu: () => void
}) {
  const bad = tasks.filter(t => t.errors.length).length
  const mismatch = md.trim() !== '' && tasks.length === 0
  return (
    <main className="main">
      <header className="head">
        <button className="btn btn-ghost sq only-mobile" onClick={onMenu} aria-label="Open projects"><Icon name="menu" /></button>
        <h1>New plan</h1>
        <span className="grow" />
        {onBackToReview && <button className="btn btn-ghost lead" onClick={onBackToReview}><Icon name="chev-l" />Back to review</button>}
      </header>
      <div className="body">
        <div className="paste">
          <div className="paste-ed">
            <div className="paste-bar">
              <span className="eyebrow">Markdown</span>
              <span className="grow" />
              <button className="btn btn-ghost sm" disabled={!md} onClick={() => onMdChange('')}>Clear</button>
            </div>
            <label htmlFor="md" className="sr">Plan markdown</label>
            <textarea
              id="md"
              autoFocus
              spellCheck={false}
              value={md}
              onChange={e => onMdChange(e.target.value)}
              placeholder={'# Plan: title\n\n## Task: task title\n### Problem\n### What to do\n### Expected outcome\n### Depends on (optional)'}
            />
          </div>
          <div className="paste-pv">
            <div className="paste-bar"><span className="eyebrow">Preview</span></div>
            {mismatch ? (
              <div className="mismatch-wrap">
                <div className="surface mismatch" role="note">
                  <h3><Icon name="alert" />This plan isn't in the app's format</h3>
                  <p>Copy the prompt below. It already includes your plan. Paste it into any AI and paste the result back here.</p>
                  <div><CopyButton icon="copy" label="Copy AI format prompt + my plan" className="" title="Copy a reformatting prompt with your plan appended" text={() => FORMAT_PROMPT + md} /></div>
                </div>
              </div>
            ) : tasks.length > 0 ? (
              <div className="pv-list">
                {tasks.map((t, i) => (
                  <div key={i} className={`surface pv-item${t.errors.length ? ' bad' : ''}`}>
                    <span className="n">{pad(i)}</span>
                    <span className="t">{t.title}</span>
                    {t.errors.length > 0
                      ? <span className="chip warn" title={t.errors.join(', ')}><Icon name="alert" />incomplete</span>
                      : t.dependsOn.length > 0 && <span className="chip" title="Dependencies"><Icon name="flow" />{t.dependsOn.length}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="pv-empty">
                <span className="ico"><Icon name="paste" /></span>
                <b>Paste a plan to see its tasks</b>
                <span>Each <code>## Task:</code> becomes one card.</span>
              </div>
            )}
            <div className="pv-foot">
              {tasks.length > 0 && (
                <span className="chip num">{tasks.length} task{tasks.length === 1 ? '' : 's'}{bad > 0 && ` · ${bad} incomplete`}</span>
              )}
              <span className="grow" />
              <button className="btn btn-primary trail" disabled={tasks.length === 0} onClick={onStartReview}>
                Start review<Icon name="send" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
