import { useEffect, useMemo, useState } from 'react'
import { withMeetings, type Project } from './lib/project'
import type { PlacedMeeting } from './lib/scheduler'
import { loadFestival, saveFestival } from './lib/festivalPersist'
import { DAY_INDICES, festivalFromProject, festivalProject, withFestivalDay, type Festival, type DayIndex } from './lib/festival'
import { commit, initialHistory, redo, undo } from './lib/history'
import { sampleProject } from './lib/sample'
import { Toolbar } from './components/Toolbar'
import { SetupPanel } from './components/SetupPanel'
import { BoardPanel } from './components/BoardPanel'
import { useScheduleSolve } from './components/useScheduleSolve'
import { Button, type UpdateProject } from './components/ui'
import { DaySetup } from './components/DaySetup'
import { ParticipantExport } from './components/ParticipantExport'
import { PrintSchedule } from './components/PrintSchedule'

export default function App() {
  const [history, setHistory] = useState(() => initialHistory(loadFestival() ?? festivalFromProject(sampleProject())))
  const [day, setDay] = useState<DayIndex>(0)
  const festival = history.present
  const project = useMemo(() => festivalProject(festival, day), [festival, day])
  const [solveRequest, setSolveRequest] = useState<{ festival: Festival; day: DayIndex; project: Project } | null>(null)
  const replaceFestival = (next: Festival) => {
    setSolveRequest(null)
    setDay(0)
    setHistory((h) => commit(h, next))
  }
  const updateProject: UpdateProject = (update) => {
    setSolveRequest(null)
    setHistory((h) => commit(h, withFestivalDay(h.present, day, update(festivalProject(h.present, day)))))
  }
  const setSolvedMeetings = (meetings: PlacedMeeting[]) => {
    setHistory((h) => solveRequest && h.present === solveRequest.festival
      ? commit(h, withFestivalDay(h.present, solveRequest.day, withMeetings(solveRequest.project, meetings))) : h)
    setSolveRequest(null)
  }
  const solverStatus = useScheduleSolve(solveRequest?.project ?? null, setSolvedMeetings)

  useEffect(() => saveFestival(festival), [festival])

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
            festival={festival}
            onReplace={replaceFestival}
            day={day}
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

      <main className="wrap flex-1 pt-3 pb-12 print:hidden">
        <nav aria-label="Festival day" className="mb-3 flex items-center gap-2">
          {DAY_INDICES.map((index) => <Button key={index} aria-pressed={day === index} onClick={() => { setSolveRequest(null); setDay(index) }}>Day {index + 1}{day === index ? ' · selected' : ''}</Button>)}
          <span className="text-muted">One festival file · shared decision makers · separate schedules</span>
        </nav>
        <DaySetup key={`setup-${day}`} project={project} onChange={updateProject} day={day} />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button disabled={!project.teams.length || !project.dms.length || !!solverStatus} onClick={() => {
            if (project.meetings.length && !confirm('Rebuild the whole schedule? Meetings may move and removed meetings may return. You can Undo to restore this board.')) return
            setSolveRequest({ festival, day, project })
          }}>{project.meetings.length ? 'Rebuild schedule' : 'Build schedule'}</Button>
          {solverStatus && <Button onClick={() => setSolveRequest(null)}>Cancel build</Button>}
          <Button disabled={!project.meetings.length} onClick={() => {
            if (!confirm(`Clear all meetings for Day ${day + 1}? Participants, requests, time slots and availability stay unchanged. The other day is untouched. You can Undo afterwards.`)) return
            updateProject((p) => withMeetings(p, []))
          }}>Clear schedule</Button>
          <Button disabled={!project.dms.length || !!solverStatus} onClick={() => window.print()}>Print / Save PDF · Day {day + 1}</Button>
          <p className="text-muted">Edit requests, then build. Manual changes stay put; only rebuilding rearranges the whole board. Undo restores any change.</p>
        </div>
        <div className="flex flex-wrap items-start justify-evenly gap-4">
          <SetupPanel project={project} onChange={updateProject} />
          <BoardPanel key={day} project={project} onChange={updateProject}
            canUndo={history.past.length > 0} canRedo={history.future.length > 0}
            onUndo={() => { setSolveRequest(null); setHistory(undo) }}
            onRedo={() => { setSolveRequest(null); setHistory(redo) }} />
        </div>
        <ParticipantExport key={`export-${day}`} project={project} festival={festival} day={day} />
      </main>
      <PrintSchedule project={project} day={day} />
    </div>
  )
}
