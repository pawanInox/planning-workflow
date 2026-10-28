import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { parsePlan, planToMarkdown } from '../shared/parse'
import { api, ApiError, setUnauthorizedHandler, type AuthUser, type Owner, type ProjectsPage as ProjectsPageData, type ProjectSummary, type ProjectWithTasks, type Spec } from './lib/api'
import { Sidebar } from './components/Sidebar'
import { Icon } from './components/Icon'
import type { SyncState } from './pages/ReviewPage'
import { hasSidePane, pad } from './lib/ui'

// route-level code splitting (React.lazy + Suspense) while keeping named exports
const InputPage = lazy(() => import('./pages/InputPage').then(m => ({ default: m.InputPage })))
const ReviewPage = lazy(() => import('./pages/ReviewPage').then(m => ({ default: m.ReviewPage })))
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const SignInPage = lazy(() => import('./pages/SignInPage').then(m => ({ default: m.SignInPage })))

export function App() {
  // 'checking' until /auth/me answers; null = signed out (every app screen shows the sign-in page)
  const [auth, setAuth] = useState<AuthUser | null | 'checking'>('checking')
  const [authError, setAuthError] = useState(() => new URLSearchParams(window.location.search).get('authError'))
  const [md, setMd] = useState('')
  const [step, setStep] = useState<'home' | 'input' | 'review'>('home')
  const [view, setView] = useState<'focus' | 'list'>('focus')
  const [done, setDone] = useState<Set<number>>(new Set())
  const [openError, setOpenError] = useState('')
  const [notice, setNotice] = useState('')
  const [navOpen, setNavOpen] = useState(false) // the sidebar is a drawer below 760px
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskIds, setTaskIds] = useState<(string | undefined)[]>([])
  const [diagram, setDiagram] = useState('')
  const [seqDiagram, setSeqDiagram] = useState('')
  const [spec, setSpec] = useState<Spec | null>(null)
  // someone else's project opens read-only; a fresh, unsaved plan is always mine to edit
  const [owner, setOwner] = useState<Owner | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [taskNodes, setTaskNodes] = useState<string[][]>([]) // diagram node ids per task, index-aligned with tasks
  const [taskRefs, setTaskRefs] = useState<string[][]>([]) // spec entry ids per task, index-aligned with tasks
  const [projectsPage, setProjectsPage] = useState<ProjectsPageData | null>(null)
  const [page, setPage] = useState(1)
  const [saveError, setSaveError] = useState('')
  // tasks whose last approval PATCH failed; a later successful PATCH for the same task clears it
  const [unsynced, setUnsynced] = useState<Map<number, string>>(new Map())
  const [flash, setFlash] = useState<{ indices: Set<number>; n: number } | null>(null)
  const [listError, setListError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingPatches, setPendingPatches] = useState(0)
  const savingRef = useRef(false)
  const syncedDone = useRef<Set<number>>(new Set())
  const deepLinkPending = useRef(new URLSearchParams(window.location.search).has('project'))
  const serverMd = useRef('') // serialized server state; poll re-hydrates only when it changes
  const serverTasks = useRef<ProjectWithTasks['tasks']>([]) // what the poll diffs against to name changed tasks

  const { planTitle, tasks } = useMemo(() => parsePlan(md), [md])
  const doneError = unsynced.size ? [...unsynced.values()].join('; ') : ''
  const sync: SyncState = saveError || doneError ? 'error' : saving || pendingPatches > 0 ? 'syncing' : 'saved'

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
    setOwner(p.owner)
    setCanEdit(p.canEdit)
    syncedDone.current = doneSet
    serverMd.current = fresh
    serverTasks.current = p.tasks
  }

  // Who am I first, then the deep link: /?project=<id> opens that project straight into review,
  // /?page=new the paste screen, /?page=projects the paste screen with the project list open. Bare /
  // is the public homepage. Signed out, any app URL shows the sign-in page and the URL is left exactly
  // as typed, so signing in comes back to it.
  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(null)) // a session that expires mid-review
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('project')
    const wantsApp = Boolean(pid || params.get('page') || params.get('authError'))
    api.me()
      .then(({ user }) => {
        setAuth(user)
        if (pid) openProject(pid).finally(() => { deepLinkPending.current = false })
        else {
          deepLinkPending.current = false
          if (params.get('page') === 'projects') { setStep('input'); setNavOpen(true) }
          else if (params.get('page') === 'new' || params.get('authError')) setStep('input')
        }
      })
      .catch(e => {
        // only a 401 means signed out; anything else is the server, and the sign-in screen says so
        if (!(e instanceof ApiError && e.status === 401)) setAuthError('unavailable')
        setAuth(null)
        deepLinkPending.current = true // hold the URL still while signed out
        if (wantsApp) setStep('input')
      })
  }, [])

  // mirror the current page into the URL so reload and copy-link restore it
  useEffect(() => {
    const url =
      step === 'review' && projectId ? `/?project=${projectId}`
      : step === 'input' && navOpen ? '/?page=projects'
      : step === 'input' ? '/?page=new'
      : '/'
    // a deep link is still resolving (or we are signed out) — rewriting the URL now would drop
    // the id it carries, and with it the page sign-in should come back to
    if (deepLinkPending.current || !auth || auth === 'checking') return
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState(null, '', url)
    }
  }, [step, projectId, navOpen, auth])

  // the sidebar is on every app screen, so refresh it whenever the open project changes too
  useEffect(() => {
    if (step === 'home' || !auth || auth === 'checking') return
    api.listProjects(page)
      .then(p => { setProjectsPage(p); setListError('') })
      .catch(e => setListError(String(e.message ?? e)))
  }, [step, page, projectId, auth])

  // reflect external edits (e.g. Claude PATCHing tasks via the API) while reviewing
  const signedIn = !!auth && auth !== 'checking'
  useEffect(() => {
    if (step !== 'review' || !projectId || !signedIn) return // a 401 mid-review stops the poll too
    const poll = setInterval(async () => {
      if (document.hidden) return // a backgrounded tab would otherwise poll forever
      try {
        const p = await api.getProject(projectId)
        if (planToMarkdown(p.title, p.tasks) === serverMd.current) {
          // Approvals are not part of the markdown. The owner's own toggles are the truth locally (the
          // done-sync effect writes them), but a reader only ever learns of the owner's approvals here.
          if (!p.canEdit) {
            const serverDone = new Set(p.tasks.flatMap((t, i) => (t.done ? [i] : [])))
            setDone(prev => (prev.size === serverDone.size && [...prev].every(i => serverDone.has(i)) ? prev : serverDone))
            syncedDone.current = serverDone
          }
          return
        }
        // ponytail: a done-toggle PATCH racing an external edit can be briefly overwritten; refetch-after-write if it ever matters
        const changed = p.tasks.flatMap((t, i) => {
          const was = serverTasks.current[i]
          return was && planToMarkdown('', [t]) === planToMarkdown('', [was]) ? [] : [i]
        })
        hydrate(p)
        setFlash(f => ({ indices: new Set(changed), n: (f?.n ?? 0) + 1 }))
        setNotice(changed.length === 1
          ? `Task ${pad(changed[0])} “${p.tasks[changed[0]].title}” was updated through the API.`
          : `This plan was updated through the API${changed.length ? ` (${changed.length} tasks)` : ''}. Showing the latest version.`)
      } catch { /* api unreachable — keep reviewing locally */ }
    }, 3000)
    return () => clearInterval(poll)
  }, [step, projectId, signedIn])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // drop the flash once it has played (1.2 s), so the next edit to the same task can replay it
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(t)
  }, [flash])

  // Escape closes the project drawer (the review page closes its own side-pane drawer)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // live-sync done toggles (List clicks and Focus swipes both go through setDone)
  useEffect(() => {
    if (!projectId || !canEdit) return // a reader's view never writes: approvals belong to the owner
    const prev = syncedDone.current
    const patch = (i: number, isDone: boolean) => {
      const tid = taskIds[i]
      if (!tid) return
      setPendingPatches(n => n + 1)
      api.setTaskDone(projectId, tid, isDone)
        .then(() => setUnsynced(m => { if (!m.has(i)) return m; const next = new Map(m); next.delete(i); return next }))
        .catch(e => {
          if (e instanceof ApiError && e.status === 403) setOpenError(e.message) // ownership changed under us
          setUnsynced(m => new Map(m).set(i, `Approval for task ${pad(i)} was not saved: ${e.message ?? e}`))
        })
        .finally(() => setPendingPatches(n => n - 1))
    }
    for (const i of done) if (!prev.has(i)) patch(i, true)
    for (const i of prev) if (!done.has(i)) patch(i, false)
    syncedDone.current = new Set(done)
  }, [done, projectId])

  async function saveProject() {
    if (savingRef.current) return
    if (projectId && !canEdit) return // a reader never saves; the server would 403 anyway
    // A PUT replaces every task with fresh ids, so re-saving an unchanged plan invalidates the
    // ids the done-sync effect is holding — any toggle racing it then PATCHes a deleted task and
    // is silently lost. Nothing changed means nothing to save.
    const unchanged = projectId !== null && planToMarkdown(planTitle || 'Untitled plan', tasks) === serverMd.current
    if (unchanged) return
    savingRef.current = true
    setSaving(true)
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
      setUnsynced(new Map()) // the PUT just wrote every done flag
      setDiagram(p.diagram ?? '')
      setSeqDiagram(p.sequenceDiagram ?? '')
      setSpec(p.spec ?? null)
      syncedDone.current = new Set(done)
      serverMd.current = planToMarkdown(title, p.tasks)
      setProjectId(p.id)
    } catch (e: any) {
      setSaveError(String(e.message ?? e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function openProject(id: string) {
    try {
      hydrate(await api.getProject(id))
      setSaveError(''); setUnsynced(new Map())
      setOpenError('')
      setNavOpen(false)
      setStep('review')
    } catch (e: any) {
      setOpenError(String(e.message ?? e))
    }
  }

  // confirmation lives in the sidebar's dialog; this only does the delete
  async function deleteProject(p: ProjectSummary) {
    try {
      await api.deleteProject(p.id)
      if (projectId === p.id) { editMd(''); setStep('input') }
      // deleting the only row on the last page would strand the user on an empty one
      const wasLastOnPage = (projectsPage?.items.length ?? 0) <= 1 && page > 1
      if (wasLastOnPage) setPage(page - 1)
      else setProjectsPage(await api.listProjects(page)) // refetch: the page's contents shifted up
    } catch (e: any) {
      // "not yours" is a message about this action, not a broken API — keep the sidebar's status out of it
      if (e instanceof ApiError && e.status === 403) setOpenError(e.message)
      else setListError(String(e.message ?? e))
    }
  }

  // edited markdown IS a new plan: it detaches from the saved project, and the old diagram no
  // longer matches the task indexes. One reset, so the two entry points cannot drift apart.
  function editMd(value: string) {
    setMd(value)
    setDone(new Set())
    setProjectId(null); setTaskIds([])
    setOwner(null); setCanEdit(true) // an edited plan is a new plan, and it is mine
    setDiagram(''); setSeqDiagram(''); setSpec(null); setTaskNodes([]); setTaskRefs([])
    syncedDone.current = new Set(); serverMd.current = ''
    setSaveError(''); setUnsynced(new Map())
  }

  function newPlan() {
    editMd('')
    setNavOpen(false)
    setStep('input')
  }

  function startReview() {
    void saveProject() // auto-create (or update) the project; review doesn't wait on it
    setStep('review')
  }

  const hasCtx = step === 'review' && hasSidePane({ diagram, seqDiagram, spec })
  const activeDone = projectId ? [...done].filter(i => taskIds[i]).length : null
  // the URL is never rewritten while signed out, so it still names the page sign-in should return to;
  // a bare / here means "Open app" was clicked on the homepage, which lands on the paste screen
  const returnParams = new URLSearchParams(window.location.search)
  returnParams.delete('authError') // a failed attempt's reason must not ride along into the next one
  const returnTo = returnParams.size ? `${window.location.pathname}?${returnParams}` : '/?page=new'
  const signOut = () => { api.logout().catch(() => {}).finally(() => window.location.assign('/')) }

  return (<>
    <div className="toasts" aria-live="polite">
      {/* opening a project can fail on any screen (a deep link, a sidebar click) — never silently */}
      {openError && (
        <div className="toast err" role="alert">
          <Icon name="alert" /><span>{openError}</span>
          <button className="btn btn-ghost sm" onClick={() => setOpenError('')}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="toast info" role="status">
          <Icon name="live" /><span>{notice}</span>
          <button className="btn btn-ghost sm" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}
    </div>
    <Suspense fallback={null}>
      {step === 'home' ? (
        <HomePage onOpen={() => setStep('input')} onProjects={() => { setStep('input'); setNavOpen(true) }} />
      ) : auth === 'checking' ? null : auth === null ? (
        <SignInPage returnTo={returnTo} authError={authError} onHome={() => setStep('home')} />
      ) : (
        <div className={`app${hasCtx ? ' has-ctx' : ''}`}>
          <Sidebar
            page={projectsPage}
            error={listError}
            activeId={step === 'review' ? projectId : null}
            activeDone={activeDone}
            open={navOpen}
            onClose={() => setNavOpen(false)}
            onHome={() => setStep('home')}
            onNewPlan={newPlan}
            onOpen={openProject}
            onDelete={deleteProject}
            onPageChange={setPage}
            user={auth}
            onSignOut={signOut}
          />
          {step === 'input' ? (
            <InputPage
              md={md}
              tasks={tasks}
              onMdChange={editMd}
              onStartReview={startReview}
              onBackToReview={projectId ? () => setStep('review') : undefined}
              onMenu={() => setNavOpen(true)}
            />
          ) : (
            <ReviewPage
              planTitle={planTitle}
              tasks={tasks}
              done={done}
              setDone={setDone}
              view={view}
              setView={setView}
              sync={sync}
              syncError={saveError || doneError}
              projectId={projectId}
              onEdit={canEdit ? () => setStep('input') : undefined}
              readOnly={!canEdit}
              owner={owner}
              onMenu={() => setNavOpen(true)}
              diagram={diagram}
              seqDiagram={seqDiagram}
              spec={spec}
              taskNodes={taskNodes}
              taskRefs={taskRefs}
              flash={flash}
            />
          )}
        </div>
      )}
    </Suspense>
  </>)
}
