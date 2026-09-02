import { useEffect } from 'react'
import './home.css'

// Real product shots, taken from the running app (light theme) — no mockups on this page.
const shot = (name: string) => `/home/${name}.jpg`

const SKILLS: [string, string, string][] = [
  [
    '/yak-dai',
    'When you know what you want',
    'It interviews you, turns the answers into a spec, then into tickets. The flowchart, the sequence diagram and the spec JSON come with it, and each task arrives tagged with the nodes and entries it touches.',
  ],
  [
    '/yang-mai-sure',
    'When you do not know yet',
    'For work too foggy for one sitting. It charts investigation tickets first and works them until the way is clear, then runs the same planning pass.',
  ],
]

const STEPS: [string, string, string, string, number, number][] = [
  [
    'Plan',
    'Run the skill, or paste your own',
    'A planning skill writes the plan and creates the project here, diagrams and all. If the plan exists already, paste the markdown and the parser splits it into tasks.',
    'paste', 1300, 873,
  ],
  [
    'Review',
    'One card at a time, or the whole board',
    'The Focus deck hands you a single task and waits. Each card repeats its own context, so whoever picks it up needs nothing else open. The List view shows every track at once.',
    'card', 1000, 814,
  ],
  [
    'Ship',
    'Approved tasks become Linear issues',
    'Tasks that do not depend on each other are grouped into independent tracks, so two people can start at the same time. Shipping carries those links into the issues.',
    'tracks', 1400, 875,
  ],
]

const FEATURES: [string, string][] = [
  ['Self-contained tasks', 'Every card carries its own problem, steps and expected outcome. No task says "see the one above".'],
  ['Swipe or type', 'Drag a card to approve or skip it, or use the arrow keys. Undo puts the last one back on top.'],
  ['Prompts in one click', 'Copy a ready-to-paste prompt for an agent to implement a task, or to review what it built.'],
  ['Independent tracks', 'The dependency graph is split into tracks that do not block each other, so work can start in parallel.'],
  ['Live sync while you read', 'The review screen polls every three seconds, so edits made through the API show up as you read.'],
  ['Deep links to a project', 'Every project has its own URL that opens straight into review, which is what the planning skills hand back.'],
]

const FAQ: [string, string][] = [
  [
    'Do I need Claude Code to use it?',
    'No. Any AI can shape a plan into the markdown the app parses, and the paste screen carries a prompt that does exactly that. The skills only automate the whole pass.',
  ],
  [
    'What reaches Linear?',
    'Approved tasks become issues with their dependencies linked. Skipped tasks stay behind in the app, and so does the spec: an issue body carries the four sections of the task and nothing else.',
  ],
  [
    'Can a plan be edited while I am reviewing it?',
    'Yes. The review screen polls the project every three seconds, so a task patched through the API updates under you without losing the approvals you already made.',
  ],
  [
    'Where does a plan live?',
    'In MongoDB, one project per plan, with its tasks, diagrams and spec. There are no accounts: it is a single-person tool.',
  ],
  [
    'Who draws the diagrams?',
    'The planning skill does, at planning time. The app never generates a diagram or a spec, it only renders them and lights up the parts the selected task touches.',
  ],
]

// One delegated handler for every in-page link on this surface (nav, hero badge, footer). The hash
// itself does the scrolling and the :target styling; this only replays the arrival animation when the
// link points at the section you are already on, which :target alone cannot do.
function flashTarget(e: React.MouseEvent) {
  const link = (e.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null
  const el = link && document.getElementById(link.hash.slice(1))
  if (!el) return
  el.classList.remove('hit')
  void el.offsetWidth // forces a reflow, without which re-adding the class does not restart the animation
  el.classList.add('hit')
}

export function HomePage({ onOpen }: { onOpen: () => void }) {
  // This page is lazy-loaded, so on a /#faq style deep link the browser has already given up looking
  // for the element by the time it mounts. Doing the jump here honours scroll-margin-top and the
  // scroll-behavior above, so it glides or snaps to match the visitor's motion preference.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <div className="home" onClick={flashTarget}>
      <a className="skip" href="#main">Skip to content</a>

      <nav className="nav">
        <div className="nav-bar">
          <a className="brand" href="#main">
            Yak Dai Tham Eng
            <span className="th">plan to linear</span>
          </a>
          <span className="nav-rule" aria-hidden="true" />
          <div className="nav-links">
            <a href="#plan">Planning</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </div>
          <button className="nav-cta" onClick={onOpen}>Open the app</button>
        </div>
      </nav>

      <main id="main">
        <section className="hero">
          <div className="wrap hero-inner">
            <a className="badge rise" href="#plan" style={{ '--i': 0 } as React.CSSProperties}>
              <span className="chip">NEW</span>
              Planning skills for Claude Code
              <span className="go">Read on</span>
            </a>
            <h1 className="rise" style={{ '--i': 1 } as React.CSSProperties}>
              Review the plan before it becomes work.
            </h1>
            <p className="lede rise" style={{ '--i': 2 } as React.CSSProperties}>
              One Claude Code command plans the work and drops it here. Review it card by card, then ship to Linear.
            </p>
            <div className="hero-actions rise" style={{ '--i': 3 } as React.CSSProperties}>
              <button className="cta" onClick={onOpen}>Open the app</button>
              <a className="cta-2" href="#how">How it works</a>
            </div>
          </div>
          <div className="wrap wrap-wide hero-stage rise" style={{ '--i': 4 } as React.CSSProperties}>
            <div className="shot lg">
              <img
                src={shot('review')}
                width={1600}
                height={1000}
                alt="The review screen: one task card open beside the plan's architecture flowchart."
                decoding="async"
              />
            </div>
            <span className="float-chip">
              <span className="dot" aria-hidden="true" />
              Diagrams and spec included
            </span>
          </div>
        </section>

        <section className="skills" id="plan">
          <div className="wrap">
            <div className="head reveal">
              <span className="tag">Planning</span>
              <h2>The plan can write itself.</h2>
              <p className="lede">
                Two Claude Code skills run the planning pass, create the project here, and hand you the link to start
                reviewing.
              </p>
            </div>
            <div className="skill-pair">
              {SKILLS.map(([cmd, title, text]) => (
                <div className="skill card reveal" key={cmd}>
                  <p className="cmd">{cmd}</p>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <div className="twin-grid">
              <div className="twin-cell reveal">
                <div className="shot">
                  <img
                    src={shot('flow')}
                    width={756}
                    height={900}
                    alt="The flowchart panel showing the release pipeline for a mobile app plan."
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p className="mono">FLOWCHART</p>
              </div>
              <div className="twin-cell reveal">
                <div className="shot">
                  <img
                    src={shot('spec')}
                    width={756}
                    height={900}
                    alt="The spec panel listing data models, with the selected task's entries highlighted."
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p className="mono">SPEC</p>
              </div>
            </div>
          </div>
        </section>

        <section className="steps" id="how">
          <div className="wrap">
            <div className="head reveal">
              <span className="tag">How it works</span>
              <h2>Three passes, and the plan is tickets.</h2>
              <p className="lede">From a goal to reviewed Linear issues, without a project manager in the middle.</p>
            </div>
            <div className="steps-list">
              {STEPS.map(([step, title, text, img, w, h], i) => (
                <div className={`step-row${i % 2 === 1 ? ' flip' : ''}`} key={step}>
                  <div className="step-copy reveal">
                    <span className="rule" aria-hidden="true" />
                    <h3>{title}</h3>
                    <p className="body">{text}</p>
                  </div>
                  <div className="shot reveal">
                    <img
                      src={shot(img)}
                      width={w}
                      height={h}
                      alt={
                        img === 'paste' ? 'The paste screen, with a plan in the editor and two tasks detected.'
                        : img === 'card' ? 'A single task card: the problem, the steps to take, and the expected outcome.'
                        : 'The list view, grouped into three independent tracks of tasks.'
                      }
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="features" id="features">
          <div className="wrap wrap-wide">
            <div className="dark">
              <div className="dark-inner">
                <div className="head reveal">
                  <span className="tag">Features</span>
                  <h2>Everything the review needs.</h2>
                  <p className="lede">The parts that make a plan readable by the person, or the agent, who picks it up.</p>
                </div>
                <div className="feature-grid">
                  {FEATURES.map(([title, text]) => (
                    <div className="feature card reveal" key={title}>
                      <span className="rule" aria-hidden="true" />
                      <h4>{title}</h4>
                      <p>{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="wrap">
            <div className="head reveal">
              <span className="tag">FAQ</span>
              <h2>Frequently asked questions.</h2>
            </div>
            <div className="faq-list">
              {FAQ.map(([q, a]) => (
                <details className="faq card reveal" key={q} name="faq">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="close">
          <div className="wrap wrap-wide">
            <div className="dark">
              <div className="dark-inner">
                <div className="head reveal">
                  <h2>Your next plan deserves a review.</h2>
                  <p className="lede">Paste one you already have, or let the skill write it.</p>
                  <div className="hero-actions">
                    <button className="cta" onClick={onOpen}>Open the app</button>
                    <a className="cta-2" href="#how">How it works</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap wrap-wide">
          <div className="foot-grid">
            <div className="foot-brand">
              <span className="brand">
                Yak Dai Tham Eng
                <span className="th">plan to linear</span>
              </span>
              <p>A plan review that runs between the agent that wrote it and the tracker that holds it.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#plan">Planning</a>
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h4>Built with</h4>
              <span>React + Vite</span>
              <span>Express + Zod</span>
              <span>MongoDB</span>
              <span>Mermaid</span>
            </div>
            <div className="foot-col">
              <h4>Start</h4>
              <a href="/?page=new" onClick={e => { e.preventDefault(); onOpen() }}>Open the app</a>
              <a href="/?page=projects">Saved projects</a>
            </div>
          </div>
          <div className="foot-base">
            <span className="mono">YAK DAI THAM ENG</span>
            <span className="mono">PLAN, REVIEW, SHIP</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
