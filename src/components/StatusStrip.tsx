import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { emptyProject, type Project } from '../lib/project'
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
 * The black strip under the header: what the project contains, whether the
 * board has problems, and the file/undo controls. Everything is saved in the
 * browser as you go; the file buttons are for moving the project elsewhere.
 */
export function StatusStrip({ project, onChange, canUndo, canRedo, onUndo, onRedo }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const issues = useMemo(() => findIssues(project.meetings).length, [project.meetings])
  const isEmpty = project.teams.length === 0 && project.dms.length === 0

  const summary = isEmpty
    ? ['empty project']
    : [
        `${project.teams.length} teams`,
        `${project.dms.length} decision makers`,
        `${project.slots.length} slots`,
        project.meetings.length ? `${project.meetings.length} meetings` : 'no board yet',
      ]

  function save() {
    download(`meeting-board-${new Date().toISOString().slice(0, 10)}.json`, serialize(project), 'application/json')
    setNote('saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  async function open(file: File) {
    try {
      onChange(deserialize(await file.text()))
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
    <div className="bg-ink font-mono text-[0.8rem] text-paper print:hidden">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-paper/80">{summary.join(' · ')}</span>
          {issues > 0 && (
            <span className="rounded-[2px] bg-warn px-1.5 text-ink">
              {issues} clash{issues === 1 ? '' : 'es'}
            </span>
          )}
          {note && <span className="text-paper/50">{note}</span>}
        </div>
        <div className="flex items-center gap-1">
          <StripButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            undo
          </StripButton>
          <StripButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            redo
          </StripButton>
          <span className="mx-1 text-paper/30">|</span>
          <StripButton onClick={save} disabled={isEmpty} title="Download the project as a file">
            save
          </StripButton>
          <StripButton onClick={() => fileInput.current?.click()} title="Open a project file">
            open
          </StripButton>
          <StripButton onClick={reset} disabled={isEmpty} title="Clear everything">
            new
          </StripButton>
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
      </div>
    </div>
  )
}

function StripButton({ children, ...props }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-[2px] border border-paper/30 px-1.5 leading-[1.5] text-paper/85 hover:border-paper hover:text-paper disabled:cursor-default disabled:opacity-30 disabled:hover:border-paper/30"
      {...props}
    >
      {children}
    </button>
  )
}
