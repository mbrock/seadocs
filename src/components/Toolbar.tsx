import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { availabilityOfProject, emptyProject, withAsks, type Project } from '../lib/project'
import { clearLocal, deserialize, serialize } from '../lib/persist'
import { findIssues } from '../lib/scheduler'
import { boardCsv, download } from '../lib/csv'
import { sampleProject } from '../lib/sample'
import { Button } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/**
 * File and history controls for the header: undo / redo, save / open / new.
 * Everything is saved in the browser as you go; the file buttons are for
 * moving the project elsewhere. Problems on the board (repeats, double bookings) show up here too.
 */
export function Toolbar({ project, onChange, canUndo, canRedo, onUndo, onRedo }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const issues = useMemo(() => findIssues(project.meetings, availabilityOfProject(project)).length, [project])
  const isEmpty = project.teams.length === 0 && project.dms.length === 0
  const hasRequests = Object.keys(project.dmAsks).length + Object.keys(project.teamAsks).length > 0

  function save() {
    download(`meeting-board-${new Date().toISOString().slice(0, 10)}.json`, serialize(project), 'application/json')
    setNote('saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  async function open(file: File) {
    try {
      const opened = deserialize(await file.text())
      if (!isEmpty && !confirm('Replace the current project with this file? You can Undo afterwards.')) return
      onChange(opened)
      setNote('opened ' + file.name)
    } catch (err) {
      setNote(`could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function reset() {
    if (!confirm('Start a new project? This clears participants, interest and the board from this browser.')) return
    clearLocal()
    onChange(emptyProject())
    setNote('new project')
  }

  function loadSample() {
    if (!isEmpty && !confirm('Replace the current project with the sample? You can Undo afterwards.')) return
    onChange(sampleProject())
    setNote('sample loaded')
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
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
      <span className="mx-1 hidden h-4 w-px bg-rule sm:block" />
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
      <Button variant="quiet" onClick={() => fileInput.current?.click()} title="Open a project file">
        Open
      </Button>
      <Button variant="quiet" onClick={reset} disabled={isEmpty} title="Clear everything">
        New
      </Button>
      <Button variant="quiet" onClick={loadSample} title="Replace the current project with the sample day">
        Sample
      </Button>
      <Button
        variant="quiet"
        disabled={!hasRequests}
        onClick={() => onChange((current) => withAsks(current, {}, {}))}
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
