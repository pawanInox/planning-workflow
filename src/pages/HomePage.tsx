import { Icon, type IconName } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'
import { pad } from '../lib/ui'

const STEPS: [string, string][] = [
  ['Paste', "Any plan in the app's format, or run /yak-dai to write one. Wrong format? Copy one prompt, run it through an AI, paste back."],
  ['Review', 'Approve or skip in the Focus deck, or scan independent tracks in the List.'],
  ['Hand off', 'Copy a ready-to-run prompt per task, or a review prompt to check the work once it lands.'],
]

const FEATURES: [IconName, string, string][] = [
  ['cards', 'Focus deck', 'Drag, click or press ← →. Undo with Z. Jump to any card from the rail.'],
  ['tracks', 'Independent tracks', 'Tasks split into tracks with no cross-dependencies, so each can be handed off separately.'],
  ['flow', 'Diagrams that follow you', 'Flowchart and sequence views light up the nodes and messages the current task touches.'],
  ['spec', 'Structured spec', 'Models, endpoints and interfaces, with the entries a task implements highlighted. Typos show as dashed chips.'],
  ['bot', 'Agent-ready prompts', 'Copy a do-this-task prompt or a code-review prompt per card. Agents can edit tasks live through the API.'],
  ['paste', 'Saved projects', 'Every review is saved with its approvals. Reopen it from the sidebar or a shared link.'],
]

export function HomePage({ onOpen, onProjects }: { onOpen: () => void; onProjects: () => void }) {
  return (
    <div className="landing">
      <nav className="l-nav">
        <span className="brand"><span className="brand-mark"><Icon name="check" /></span>Yak Dai</span>
        <span className="grow" />
        <ThemeToggle />
        <button className="btn btn-ghost" onClick={onProjects}>Projects</button>
        <button className="btn btn-outline trail" onClick={onOpen}>Open app<Icon name="send" /></button>
      </nav>
      <header className="l-hero stagger">
        <span className="eyebrow">Plan → review → hand off</span>
        <h1>Review a plan <em>one card at a time</em>, then hand it off.</h1>
        <p>Paste a markdown plan. Swipe through each task with its diagram and spec beside it. Approve or skip, then hand each task to an agent with one copied prompt.</p>
        <div className="l-cta">
          <button className="btn btn-primary lg lead" onClick={onOpen}><Icon name="paste" />Paste a plan</button>
          <button className="btn btn-outline lg" onClick={onProjects}>Open saved projects</button>
        </div>
      </header>
      <section className="l-steps">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="surface l-step"><span className="n">{pad(i)}</span><h3>{title}</h3><p>{body}</p></div>
        ))}
      </section>
      <section className="l-feat">
        <h2>Everything a reviewer needs, nothing they don't</h2>
        <div className="l-grid">
          {FEATURES.map(([icon, title, body]) => (
            <div key={title} className="surface l-card"><span className="ico"><Icon name={icon} /></span><h3>{title}</h3><p>{body}</p></div>
          ))}
        </div>
      </section>
    </div>
  )
}
