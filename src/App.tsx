import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { emptyProject, type Project } from './lib/project'
import { loadLocal, saveLocal } from './lib/persist'
import { commit, initialHistory, redo, undo } from './lib/history'
import { Toolbar } from './components/Toolbar'
import { SetupPanel } from './components/SetupPanel'
import { BoardPanel } from './components/BoardPanel'
import { SchedulesPanel } from './components/SchedulesPanel'

const VIEWS = [
  ['setup', 'Setup'],
  ['board', 'Board'],
  ['schedules', 'Schedules'],
] as const
type View = (typeof VIEWS)[number][0]

const isView = (s: string): s is View => VIEWS.some(([id]) => id === s)

/** The view lives in the URL hash so reload and back/forward keep it. */
function useView(fallback: View): [View, (v: View) => void] {
  const read = () => {
    const h = location.hash.slice(1)
    // Old bookmarks still land in the now-unified Setup workflow.
    if (h === 'interest') return 'setup'
    return isView(h) ? h : fallback
  }
  const [view, setView] = useState<View>(read)
  useEffect(() => {
    const onChange = () => setView(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  })
  return [view, (v) => (location.hash = v)]
}

export default function App() {
  const [history, setHistory] = useState(() => initialHistory(loadLocal() ?? emptyProject()))
  const project = history.present
  const setProject: Dispatch<SetStateAction<Project>> = useCallback(
    (action) => setHistory((h) => commit(h, typeof action === 'function' ? action(h.present) : action)),
    [],
  )
  const [view, setView] = useView(project.meetings.length ? 'board' : 'setup')

  useEffect(() => saveLocal(project), [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return
      e.preventDefault()
      setHistory(e.shiftKey ? redo : undo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col print:block">
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas print:hidden">
        <div className="wrap flex flex-wrap items-center gap-x-5 gap-y-1 py-1.5">
          <span className="text-[0.85rem] font-extrabold tracking-[-0.02em] whitespace-nowrap">Meeting Board</span>
          <nav aria-label="Views" className="flex gap-1 overflow-x-auto">
            {VIEWS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={view === id ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  setView(id)
                }}
                className={`rounded-[3px] px-2 py-0.5 text-[0.85rem] font-semibold whitespace-nowrap ${
                  view === id ? 'bg-ink text-paper' : 'text-muted hover:bg-paper hover:text-ink'
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto">
            <Toolbar
              project={project}
              onChange={setProject}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              onUndo={() => setHistory(undo)}
              onRedo={() => setHistory(redo)}
            />
          </div>
        </div>
      </header>

      <main className="wrap flex-1 py-3 print:p-0">
        {/* Keep Setup mounted so unapplied textarea edits survive visits to the board or schedules. */}
        <div hidden={view !== 'setup'}>
          <SetupPanel project={project} onChange={setProject} />
        </div>
        {view === 'board' && <BoardPanel project={project} onChange={setProject} />}
        {view === 'schedules' && <SchedulesPanel project={project} />}
      </main>

      <footer className="wrap border-t border-rule py-3 text-[0.8rem] text-muted print:hidden">
        Meeting Board ·{' '}
        <a className="underline hover:text-ink" href="https://github.com/mbrock/seadocs">
          source
        </a>
      </footer>
    </div>
  )
}
