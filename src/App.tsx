import { useEffect, useState } from 'react'
import { withMeetings, type Project } from './lib/project'
import type { PlacedMeeting } from './lib/scheduler'
import { loadLocal, saveLocal } from './lib/persist'
import { commit, initialHistory, redo, undo } from './lib/history'
import { sampleProject } from './lib/sample'
import { Toolbar } from './components/Toolbar'
import { SetupPanel } from './components/SetupPanel'
import { BoardPanel } from './components/BoardPanel'
import { useScheduleSolve } from './components/useScheduleSolve'
import { Button, type UpdateProject } from './components/ui'
import { DaySetup } from './components/DaySetup'
import { ParticipantExport } from './components/ParticipantExport'

export default function App() {
  const [history, setHistory] = useState(() => initialHistory(loadLocal() ?? sampleProject()))
  const project = history.present
  const [solveRequest, setSolveRequest] = useState<Project | null>(null)
  const updateProject: UpdateProject = (update) => {
    setSolveRequest(null)
    setHistory((h) => commit(h, update(h.present)))
  }
  const setSolvedMeetings = (meetings: PlacedMeeting[]) => {
    setHistory((h) => h.present === solveRequest ? commit(h, withMeetings(h.present, meetings)) : h)
    setSolveRequest(null)
  }
  const solverStatus = useScheduleSolve(solveRequest, setSolvedMeetings)

  useEffect(() => saveLocal(project), [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) return
      e.preventDefault()
      setSolveRequest(null)
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
            onUndo={() => { setSolveRequest(null); setHistory(undo) }}
            onRedo={() => { setSolveRequest(null); setHistory(redo) }}
            solverStatus={solverStatus}
          />
        </div>
      </header>

      <main className="wrap flex-1 pt-3 pb-12 print:p-0">
        <DaySetup project={project} onChange={updateProject} />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button disabled={!project.teams.length || !project.dms.length || !!solverStatus} onClick={() => {
            if (project.meetings.length && !confirm('Rebuild the whole schedule? Meetings may move and removed meetings may return. You can Undo to restore this board.')) return
            setSolveRequest(project)
          }}>{project.meetings.length ? 'Rebuild schedule' : 'Build schedule'}</Button>
          {solverStatus && <Button onClick={() => setSolveRequest(null)}>Cancel build</Button>}
          <p className="text-muted">Edit requests, then build. Manual changes stay put; only rebuilding rearranges the whole board. Undo restores any change.</p>
        </div>
        <div className="flex flex-wrap items-start justify-evenly gap-4">
          <SetupPanel project={project} onChange={updateProject} />
          <BoardPanel project={project} onChange={updateProject} />
        </div>
        <ParticipantExport project={project} />
      </main>
    </div>
  )
}
