import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { parsePlan, planToMarkdown } from '../shared/parse'
import { api, type CreatedIssue, type ProjectSummary, type Team } from './lib/api'

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
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskIds, setTaskIds] = useState<(string | undefined)[]>([])
  const [diagram, setDiagram] = useState('')
  const [seqDiagram, setSeqDiagram] = useState('')
  const [taskNodes, setTaskNodes] = useState<string[][]>([]) // diagram node ids per task, index-aligned with tasks
  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([])
  const [saveError, setSaveError] = useState('')
  const [listError, setListError] = useState('')
  const saving = useRef(false)
  const syncedDone = useRef<Set<number>>(new Set())
  const serverMd = useRef('') // serialized server state; poll re-hydrates only when it changes

  const { planTitle, tasks } = useMemo(() => parsePlan(md), [md])
  const shippable = [...done].sort((a, b) => a - b).map(i => tasks[i]).filter(t => t && t.errors.length === 0)

  // deep link: /?project=<id> opens that project straight into review, /?page=projects opens the list
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('project')
    if (pid) openProject(pid)
    else if (params.get('page') === 'projects') setStep('projects')
  }, [])

  // mirror the current page into the URL so reload and copy-link restore it
  useEffect(() => {
    const url =
      step === 'projects' ? '/?page=projects'
      : (step === 'review' || step === 'create') && projectId ? `/?project=${projectId}`
      : '/'
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
    api.listProjects().then(setSavedProjects)
  }, [step])

  // reflect external edits (e.g. Claude PATCHing tasks via the API) while reviewing
  useEffect(() => {
    if (step !== 'review' || !projectId) return
    const poll = setInterval(async () => {
      try {
        const p = await api.getProject(projectId)
        const fresh = planToMarkdown(p.title, p.tasks)
        if (fresh === serverMd.current) return
        // ponytail: a done-toggle PATCH racing an external edit can be briefly overwritten; refetch-after-write if it ever matters
        const doneSet = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
        serverMd.current = fresh
        setMd(fresh)
        setDone(doneSet)
        syncedDone.current = doneSet
        setTaskIds(p.tasks.map(t => t.id))
        setDiagram(p.diagram ?? '')
        setSeqDiagram(p.sequenceDiagram ?? '')
        setTaskNodes(p.tasks.map(t => t.diagramNodes ?? []))
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
        .then(r => { if (!r.ok) console.warn(`done sync failed for task ${i}: ${r.status}`) })
        .catch(e => console.warn(`done sync failed for task ${i}:`, e))
    }
    for (const i of done) if (!prev.has(i)) patch(i, true)
    for (const i of prev) if (!done.has(i)) patch(i, false)
    syncedDone.current = new Set(done)
  }, [done, projectId])

  async function saveProject() {
    if (saving.current) return
    saving.current = true
    setSaveError('')
    try {
      const title = planTitle || 'Untitled plan'
      const payload = tasks
        .map((t, i) => t.errors.length ? null : ({
          title: t.title, problem: t.problem, todo: t.todo, outcome: t.outcome,
          dependsOn: t.dependsOn, done: done.has(i),
          diagramNodes: taskNodes[i] ?? [], // carry nodes through PUT's replace-all-tasks
        }))
        .filter(t => t !== null)
      const p = projectId
        ? await api.updateProject(projectId, title, payload)
        : await api.createProject(title, payload)
      let j = 0
      setTaskIds(tasks.map(t => (t.errors.length ? undefined : p.tasks[j++]?.id)))
      setDiagram(p.diagram ?? '')
      setSeqDiagram(p.sequenceDiagram ?? '')
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
      const p = await api.getProject(id)
      const doneSet = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
      const fresh = planToMarkdown(p.title, p.tasks)
      setMd(fresh)
      setDone(doneSet)
      setCreated([])
      setTaskIds(p.tasks.map(t => t.id))
      setDiagram(p.diagram ?? '')
      setSeqDiagram(p.sequenceDiagram ?? '')
      setTaskNodes(p.tasks.map(t => t.diagramNodes ?? []))
      syncedDone.current = doneSet
      serverMd.current = fresh
      setProjectId(p.id)
      setSaveError('')
      setCameFrom('projects')
      setStep('review')
    } catch (e: any) {
      setError(String(e.message ?? e))
    }
  }

  async function deleteProject(p: ProjectSummary) {
    if (!window.confirm(`Delete "${p.title}" and its ${p.taskCount} task${p.taskCount === 1 ? '' : 's'}?`)) return
    try {
      await api.deleteProject(p.id)
      setSavedProjects(prev => prev.filter(x => x.id !== p.id))
      if (projectId === p.id) { setProjectId(null); setTaskIds([]) }
    } catch (e: any) {
      setListError(String(e.message ?? e))
    }
  }

  function newPlan() {
    setMd(''); setDone(new Set()); setCreated([])
    setProjectId(null); setTaskIds([])
    setDiagram(''); setSeqDiagram(''); setTaskNodes([])
    syncedDone.current = new Set(); serverMd.current = ''
    setSaveError('')
    setStep('input')
  }

  function editMd(value: string) {
    setMd(value)
    setDone(new Set()); setCreated([])
    setProjectId(null); setTaskIds([]); syncedDone.current = new Set()
    setDiagram(''); setSeqDiagram(''); setTaskNodes([]) // edited markdown is a new plan — old diagram no longer matches task indexes
  }

  function startReview() {
    void saveProject() // auto-create (or update) the project; review doesn't wait on it
    setCameFrom('input')
    setStep('review')
  }

  async function create() {
    setBusy(true); setError(''); setCreated([])
    try {
      const data = await api.createIssues(teamId, shippable)
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
      {step === 'input' ? (
        <InputPage
          md={md}
          tasks={tasks}
          hasProjects={savedProjects.length > 0}
          onMdChange={editMd}
          onShowProjects={() => setStep('projects')}
          onStartReview={startReview}
        />
      ) : step === 'projects' ? (
        <ProjectsPage
          projects={savedProjects}
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
          onShip={() => setStep('create')}
          diagram={diagram}
          seqDiagram={seqDiagram}
          taskNodes={taskNodes}
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
