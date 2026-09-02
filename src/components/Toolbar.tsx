import { useRef, useState, type CSSProperties } from 'react'
import { availabilityOfProject, emptyProject, hasAsks, withAsks, type Project } from '../lib/project'
import { clearLocal, deserialize, serialize } from '../lib/persist'
import { findIssues } from '../lib/scheduler'
import { boardCsv, download } from '../lib/csv'
import { sampleProject } from '../lib/sample'
import type { SolverStatusInfo } from '../lib/advancedSolver'
import { Button, type UpdateProject } from './ui'

interface Props {
  project: Project
  onChange: UpdateProject
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  solverStatus: SolverStatusInfo | null
}

/**
 * The header bar: solver progress, problems on the board, undo / redo, and the
 * file actions. The project autosaves in the browser; files are for moving it elsewhere.
 */
export function Toolbar({ project, onChange, canUndo, canRedo, onUndo, onRedo, solverStatus }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const issues = findIssues(project.meetings, availabilityOfProject(project)).length
  const isEmpty = project.teams.length === 0 && project.dms.length === 0

  const replaceWith = (next: Project, question: string, done: string) => {
    if (!isEmpty && !confirm(question)) return
    onChange(() => next)
    setNote(done)
  }

  const save = () => {
    download(`meeting-board-${new Date().toISOString().slice(0, 10)}.json`, serialize(project), 'application/json')
    setNote('saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  const open = async (file: File) => {
    try {
      replaceWith(deserialize(await file.text()), 'Replace the current project with this file? You can Undo afterwards.', 'opened ' + file.name)
    } catch (err) {
      setNote(`could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const reset = () => {
    if (!confirm('Start a new project? This clears participants, interest and the board from this browser.')) return
    clearLocal()
    onChange(() => emptyProject())
    setNote('new project')
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <SolverProgress status={solverStatus} />
      {issues > 0 && (
        <a href="#board" className="mr-2 rounded-[2px] bg-warn px-1.5 font-semibold text-paper">
          {issues} problem{issues === 1 ? '' : 's'}
        </a>
      )}
      {note && <span className="mr-2 hidden text-muted sm:inline">{note}</span>}
      <Button variant="quiet" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </Button>
      <Button variant="quiet" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </Button>
      <Divider />
      <Button variant="quiet" onClick={reset} disabled={isEmpty} title="Clear everything">
        New
      </Button>
      <Button variant="quiet" onClick={() => fileInput.current?.click()} title="Open a project file">
        Open
      </Button>
      <Button variant="quiet" onClick={save} disabled={isEmpty} title="Download the project as a file">
        Save
      </Button>
      <Button
        variant="quiet"
        disabled={project.meetings.length === 0 || issues > 0}
        title={issues > 0 ? 'Fix the problems first' : 'Export the board as a spreadsheet'}
        onClick={() => download('meeting-board.csv', boardCsv(project), 'text/csv')}
      >
        Export
      </Button>
      <Divider />
      <Button
        variant="quiet"
        onClick={() => replaceWith(sampleProject(), 'Replace the current project with the sample? You can Undo afterwards.', 'sample loaded')}
        title="Replace the current project with the sample day"
      >
        Sample
      </Button>
      <Button
        variant="quiet"
        disabled={!hasAsks(project)}
        onClick={() => onChange((p) => withAsks(p, {}, {}))}
        title="Clear every decision-maker and team request"
      >
        <span className="sm:hidden">Clear</span>
        <span className="hidden sm:inline">Clear requests</span>
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void open(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Divider() {
  return <span className="mx-1 hidden h-4 w-px bg-rule sm:block" />
}

const PHASES = 7

/** A thin bar that fills phase by phase; during a phase it animates towards the phase's end over its time limit. */
function SolverProgress({ status }: { status: SolverStatusInfo | null }) {
  if (!status) return <span aria-hidden="true" className="mr-2 h-1 w-20" />

  const total = status.totalPhases ?? PHASES
  const phase = status.phaseIndex ?? 0
  const running = status.state === 'phase-started' || status.state === 'incumbent'
  const limit = status.timeLimitSeconds ?? 1
  const elapsed = status.state === 'incumbent' ? (status.solverWallTime ?? 0) : 0
  const from = ((Math.max(0, phase - 1) + Math.min(1, elapsed / limit)) / total) * 100
  const to = (phase / total) * 100
  const label = status.phase ? `${phase}/${total} · ${status.phase}` : 'Preparing solver'
  const bar = running
    ? { className: 'scheduling-progress', style: { '--progress-from': `${from}%`, '--progress-to': `${to}%`, '--progress-duration': `${Math.max(0, limit - elapsed)}s` } as CSSProperties }
    : { className: '', style: { width: `${to}%` } }

  return (
    <span
      role="progressbar"
      aria-label="Building schedule"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(phase, total)}
      aria-valuetext={label}
      title={label}
      className="mr-2 h-1 w-20 overflow-hidden rounded-full bg-rule"
    >
      <span key={`${phase}-${status.state}-${elapsed}`} className={`block h-full bg-accent ${bar.className}`} style={bar.style} />
    </span>
  )
}
