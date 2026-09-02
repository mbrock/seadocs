import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { availabilityOfProject, emptyProject, type Project } from '../lib/project'
import { clearLocal, deserialize, serialize } from '../lib/persist'
import { findIssues } from '../lib/scheduler'
import { download } from '../lib/csv'

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

  return (
    <div className="flex items-center gap-1 text-[0.8rem]">
      {issues > 0 && (
        <a href="#board" className="mr-2 rounded-[2px] bg-warn px-1.5 font-semibold text-paper">
          {issues} problem{issues === 1 ? '' : 's'}
        </a>
      )}
      {note && <span className="mr-2 hidden text-muted sm:inline">{note}</span>}
      <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </ToolButton>
      <ToolButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-rule" />
      <ToolButton onClick={save} disabled={isEmpty} title="Download the project as a file">
        Save
      </ToolButton>
      <ToolButton onClick={() => fileInput.current?.click()} title="Open a project file">
        Open
      </ToolButton>
      <ToolButton onClick={reset} disabled={isEmpty} title="Clear everything">
        New
      </ToolButton>
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

function ToolButton({ children, ...props }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-[3px] px-1.5 py-0.5 font-semibold text-muted hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
      {...props}
    >
      {children}
    </button>
  )
}
