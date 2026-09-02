import { useEffect, useState } from 'react'
import { withMeetings } from './lib/project'
import type { PlacedMeeting } from './lib/scheduler'
import { loadLocal, saveLocal } from './lib/persist'
import { commit, initialHistory, redo, undo } from './lib/history'
import { sampleProject } from './lib/sample'
import { Toolbar } from './components/Toolbar'
import { SetupPanel } from './components/SetupPanel'
import { BoardPanel } from './components/BoardPanel'
import { useAutoSolve } from './components/useAutoSolve'
import type { UpdateProject } from './components/ui'

export default function App() {
  const [history, setHistory] = useState(() => initialHistory(loadLocal() ?? sampleProject()))
  const project = history.present
  const updateProject: UpdateProject = (update) => setHistory((h) => commit(h, update(h.present)))
  /** Solver results replace the board without becoming an undo step. */
  const setSolvedMeetings = (meetings: PlacedMeeting[]) => setHistory((h) => ({ ...h, present: withMeetings(h.present, meetings) }))
  const solverStatus = useAutoSolve(project, setSolvedMeetings)

  useEffect(() => saveLocal(project), [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) return
      e.preventDefault()
      setHistory(e.shiftKey ? redo : undo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink print:block">
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas print:hidden">
        <div className="wrap flex justify-end py-1.5">
          <Toolbar
            project={project}
            onChange={updateProject}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onUndo={() => setHistory(undo)}
            onRedo={() => setHistory(redo)}
            solverStatus={solverStatus}
          />
        </div>
      </header>

      <main className="wrap flex-1 pt-3 pb-12 print:p-0">
        <div className="flex flex-wrap items-start justify-evenly gap-4">
          <SetupPanel project={project} onChange={updateProject} />
          <BoardPanel project={project} onChange={updateProject} />
        </div>
      </main>
    </div>
  )
}
