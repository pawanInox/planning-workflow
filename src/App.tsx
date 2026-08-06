import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { parsePlan, planToMarkdown } from '../shared/parse'
import { api, type CreatedIssue, type ProjectsPage as ProjectsPageData, type ProjectSummary, type ProjectWithTasks, type Spec, type Team } from './lib/api'

// route-level code splitting (React.lazy + Suspense) while keeping named exports
const InputPage = lazy(() => import('./pages/InputPage').then(m => ({ default: m.InputPage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const ReviewPage = lazy(() => import('./pages/ReviewPage').then(m => ({ default: m.ReviewPage })))
const ShipPage = lazy(() => import('./pages/ShipPage').then(m => ({ default: m.ShipPage })))

export function App() {
  const [md, setMd] = useState('')
  const [step, setStep] = useState<'input' | 'review' | 'create' | 'projects'>('input')
  const [cameFrom, setCameFrom] = useState<'input' | 'projects'>('input')
  const [view, setView] = useState<'focus' | 'list'>('focus')
  const [done, setDone] = useState<Set<number>>(new Set())
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<CreatedIssue[]>([])
  const [error, setError] = useState('')
  const [openError, setOpenError] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskIds, setTaskIds] = useState<(string | undefined)[]>([])
  const [diagram, setDiagram] = useState('')
  const [seqDiagram, setSeqDiagram] = useState('')
  const [spec, setSpec] = useState<Spec | null>(null)
  const [taskNodes, setTaskNodes] = useState<string[][]>([]) // diagram node ids per task, index-aligned with tasks
  const [taskRefs, setTaskRefs] = useState<string[][]>([]) // spec entry ids per task, index-aligned with tasks
  const [projectsPage, setProjectsPage] = useState<ProjectsPageData | null>(null)
  const [page, setPage] = useState(1)
  const [saveError, setSaveError] = useState('')
  const [listError, setListError] = useState('')
  const saving = useRef(false)
  const syncedDone = useRef<Set<number>>(new Set())
  const deepLinkPending = useRef(new URLSearchParams(window.location.search).has('project'))
  const serverMd = useRef('') // serialized server state; poll re-hydrates only when it changes

  const { planTitle, tasks } = useMemo(() => parsePlan(md), [md])
  // kept as indices too: a task's spec refs live in `taskRefs`, which is index-aligned with `tasks`
  const shippableIdx = [...done].sort((a, b) => a - b).filter(i => tasks[i] && tasks[i].errors.length === 0)
  const shippable = shippableIdx.map(i => tasks[i])

  // the one place that maps a saved project onto state — used by both the initial open and the
  // poll, so a newly persisted field can never load in one path and be forgotten in the other
  function hydrate(p: ProjectWithTasks) {
    const doneSet = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
    const fresh = planToMarkdown(p.title, p.tasks)
    setMd(fresh)
    setDone(doneSet)
    setTaskIds(p.tasks.map(t => t.id))
    setDiagram(p.diagram ?? '')
    setSeqDiagram(p.sequenceDiagram ?? '')
    setSpec(p.spec ?? null)
    setTaskNodes(p.tasks.map(t => t.diagramNodes ?? []))
    setTaskRefs(p.tasks.map(t => t.specRefs ?? []))
    setProjectId(p.id)
    syncedDone.current = doneSet
    serverMd.current = fresh
  }

  // deep link: /?project=<id> opens that project straight into review, /?page=projects opens the list
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('project')
    if (pid) openProject(pid).finally(() => { deepLinkPending.current = false })
    else {
      deepLinkPending.current = false
      if (params.get('page') === 'projects') setStep('projects')
    }
  }, [])

  // mirror the current page into the URL so reload and copy-link restore it
  useEffect(() => {
    const url =
      step === 'projects' ? '/?page=projects'
      : (step === 'review' || step === 'create') && projectId ? `/?project=${projectId}`
      : '/'
    // a deep link is still resolving — rewriting the URL now would drop the id it carries
    if (deepLinkPending.current) return
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState(null, '', url)
    }
  }, [step, projectId])

  useEffect(() => {
    api.listTeams()
      .then(t => { setTeams(t); if (t[0]) setTeamId(t[0].id) })
      .catch(e => setError(String(e.message ?? e)))
  }, [])

  useEffect(() => {
    if (step !== 'input' && step !== 'projects') return
    api.listProjects(page)
      .then(p => { setProjectsPage(p); setListError('') })
      .catch(e => setListError(String(e.message ?? e)))
  }, [step, page])

  // reflect external edits (e.g. Claude PATCHing tasks via the API) while reviewing
  useEffect(() => {
    if (step !== 'review' || !projectId) return
    const poll = setInterval(async () => {
      if (document.hidden) return // a backgrounded tab would otherwise poll forever
      try {
        const p = await api.getProject(projectId)
        if (planToMarkdown(p.title, p.tasks) === serverMd.current) return
        // ponytail: a done-toggle PATCH racing an external edit can be briefly overwritten; refetch-after-write if it ever matters
        hydrate(p)
      } catch { /* api unreachable — keep reviewing locally */ }
    }, 3000)
    return () => clearInterval(poll)
  }, [step, projectId])

  // live-sync done toggles (List clicks and Focus swipes both go through setDone)
  useEffect(() => {
    if (!projectId) return
    const prev = syncedDone.current
    const patch = (i: number, isDone: boolean) => {
      const tid = taskIds[i]
      if (!tid) return
      api.setTaskDone(projectId, tid, isDone)
        .catch(e => console.warn(`done sync failed for task ${i}:`, e))
    }
    for (const i of done) if (!prev.has(i)) patch(i, true)
    for (const i of prev) if (!done.has(i)) patch(i, false)
    syncedDone.current = new Set(done)
  }, [done, projectId])

  async function saveProject() {
    if (saving.current) return
    // A PUT replaces every task with fresh ids, so re-saving an unchanged plan invalidates the
    // ids the done-sync effect is holding — any toggle racing it then PATCHes a deleted task and
    // is silently lost. Nothing changed means nothing to save.
    const unchanged = projectId !== null && planToMarkdown(planTitle || 'Untitled plan', tasks) === serverMd.current
    if (unchanged) return
    saving.current = true
    setSaveError('')
    try {
      const title = planTitle || 'Untitled plan'
      const payload = tasks
        .map((t, i) => t.errors.length ? null : ({
          title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
          dependsOn: t.dependsOn, done: done.has(i),
          diagramNodes: taskNodes[i] ?? [], // carry nodes through PUT's replace-all-tasks
          specRefs: taskRefs[i] ?? [], // same — a PUT without these wipes every task's spec refs
        }))
        .filter(t => t !== null)
      const p = projectId
        ? await api.updateProject(projectId, title, payload)
        : await api.createProject(title, payload)
      let j = 0
      setTaskIds(tasks.map(t => (t.errors.length ? undefined : p.tasks[j++]?.id)))
      setDiagram(p.diagram ?? '')
      setSeqDiagram(p.sequenceDiagram ?? '')
      setSpec(p.spec ?? null)
      syncedDone.current = new Set(done)
      serverMd.current = planToMarkdown(title, p.tasks)
      setProjectId(p.id)
    } catch (e: any) {
      setSaveError(String(e.message ?? e))
    } finally {
      saving.current = false
    }
  }

  async function openProject(id: string) {
    try {
      hydrate(await api.getProject(id))
      setCreated([])
      setSaveError('')
      setOpenError('')
      setCameFrom('projects')
      setStep('review')
    } catch (e: any) {
      setOpenError(String(e.message ?? e))
    }
  }

  async function deleteProject(p: ProjectSummary) {
    if (!window.confirm(`Delete "${p.title}" and its ${p.taskCount} task${p.taskCount === 1 ? '' : 's'}?`)) return
    try {
      await api.deleteProject(p.id)
      if (projectId === p.id) { setProjectId(null); setTaskIds([]) }
      // deleting the only row on the last page would strand the user on an empty one
      const wasLastOnPage = (projectsPage?.items.length ?? 0) <= 1 && page > 1
      if (wasLastOnPage) setPage(page - 1)
      else setProjectsPage(await api.listProjects(page)) // refetch: the page's contents shifted up
    } catch (e: any) {
      setListError(String(e.message ?? e))
    }
  }

  // edited markdown IS a new plan: it detaches from the saved project, and the old diagram no
  // longer matches the task indexes. One reset, so the two entry points cannot drift apart.
  function editMd(value: string) {
    setMd(value)
    setDone(new Set()); setCreated([])
    setProjectId(null); setTaskIds([])
    setDiagram(''); setSeqDiagram(''); setSpec(null); setTaskNodes([]); setTaskRefs([])
    syncedDone.current = new Set(); serverMd.current = ''
    setSaveError('')
  }

  function newPlan() {
    editMd('')
    setStep('input')
  }

  function startReview() {
    void saveProject() // auto-create (or update) the project; review doesn't wait on it
    setCameFrom('input')
    setStep('review')
  }

  async function create() {
    setBusy(true); setError(''); setCreated([])
    try {
      // just the tasks: the project spec stays in the app and never rides along to Linear
      const payload = shippableIdx.map(i => tasks[i])
      const data = await api.createIssues(teamId, payload)
      setCreated(data.created)
      if (data.relationErrors?.length) setError(`Issues created, but some links failed: ${data.relationErrors.join('; ')}`)
    } catch (e: any) {
      setError(String(e.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Suspense fallback={null}>
      {/* `error` is set by paths that can fire on any step (opening a project, a deep link,
          loading teams); without this banner those failures were completely silent */}
      {openError && (
        <div className="card" role="alert" style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          maxWidth: 'min(680px, calc(100vw - 32px))', borderColor: 'var(--warn-border)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 13, color: 'var(--warn)', minWidth: 0 }}>⚠ {openError}</span>
          <button className="btn-ghost" style={{ height: 26, fontSize: 12, padding: '0 10px', marginLeft: 'auto' }}
            onClick={() => setOpenError('')}>Dismiss</button>
        </div>
      )}
      {step === 'input' ? (
        <InputPage
          md={md}
          tasks={tasks}
          hasProjects={(projectsPage?.total ?? 0) > 0 || listError !== ''}
          onMdChange={editMd}
          onShowProjects={() => setStep('projects')}
          onStartReview={startReview}
        />
      ) : step === 'projects' ? (
        <ProjectsPage
          page={projectsPage}
          onPageChange={setPage}
          error={listError}
          onOpen={openProject}
          onDelete={deleteProject}
          onNewPlan={newPlan}
        />
      ) : step === 'review' ? (
        <ReviewPage
          planTitle={planTitle}
          tasks={tasks}
          done={done}
          setDone={setDone}
          view={view}
          setView={setView}
          saveError={saveError}
          backLabel={cameFrom === 'projects' ? '← Projects' : '← Edit plan'}
          onBack={() => setStep(cameFrom)}
          onShip={() => { setCreated([]); setStep('create') }}
          diagram={diagram}
          seqDiagram={seqDiagram}
          spec={spec}
          taskNodes={taskNodes}
          taskRefs={taskRefs}
        />
      ) : (
        <ShipPage
          tasks={tasks}
          shippable={shippable}
          teams={teams}
          teamId={teamId}
          setTeamId={setTeamId}
          busy={busy}
          created={created}
          error={error}
          onBack={() => setStep('review')}
          onCreate={create}
        />
      )}
    </Suspense>
  )
}
