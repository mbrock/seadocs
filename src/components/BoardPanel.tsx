import { useEffect, useRef, useState } from 'react'
import { askedBy } from '../lib/describe'
import { asksFor, availabilityOfProject, participants, slotLabel, type Asked, type Project } from '../lib/project'
import { indexMeetings, meetingAt, otherSide, pairKey, type Side } from '../lib/scheduler'
import { Inspector, type Cell } from './Inspector'
import { Name, RequestMark, type UpdateProject } from './ui'
import { useNames, type ParticipantName } from './useNames'

interface Props {
  project: Project
  onChange: UpdateProject
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

/** The generated board in both orientations, with a side panel for the selected cell. */
export function BoardPanel({ project, onChange, ...history }: Props) {
  const [cell, setCell] = useState<Cell | null>(null)
  const selected =
    cell && project.slots.some((s) => s.id === cell.slot) && participants(project, cell.side).some((p) => p.id === cell.anchor) ? cell : null

  return (
    <>
      <section id="board" className="w-full scroll-mt-12">
        <h2 className="font-bold">Schedule</h2>
        <p className="mb-3 text-muted">Click any meeting to remove, replace or move it. Click an empty slot to add a meeting. Nothing else is rebuilt.</p>
        {project.teams.length && project.dms.length ? (
          <Grid project={project} selected={selected} onSelect={setCell} />
        ) : (
          <p className="px-2 py-3 text-center text-muted">
            Add decision makers and film teams in Edit setup first.
          </p>
        )}
      </section>
      {selected && <EditorDialog onClose={() => setCell(null)}>
        <Inspector key={`${selected.side}|${selected.anchor}|${selected.slot}`} project={project} cell={selected} onChange={onChange} onClose={() => setCell(null)} onSelectSlot={(slot) => setCell({ ...selected, slot })} {...history} />
      </EditorDialog>}
    </>
  )
}

/** Native modal focus management keeps the editor visible and returns focus to its cell. */
function EditorDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const opener = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
  return <dialog ref={dialog} aria-labelledby="meeting-editor-title" onCancel={onClose}
    className="fixed inset-auto right-0 bottom-0 m-0 h-[90dvh] max-h-dvh w-full max-w-none border border-rule bg-paper p-0 text-ink shadow-xl backdrop:bg-black/30 sm:top-0 sm:h-dvh sm:w-[32rem]">
    {children}
  </dialog>
}

/** Decision makers × slots above teams × slots, in one table so both share the slot columns. */
function Grid({ project, selected, onSelect }: { project: Project; selected: Cell | null; onSelect: (cell: Cell) => void }) {
  const names = useNames(project)
  const index = indexMeetings(project.meetings)
  const available = availabilityOfProject(project)

  const header = (corner: string) => (
    <tr>
      <th aria-label={corner} className="sticky top-0 left-0 z-30 h-6 w-px bg-paper p-0" />
      {project.slots.map((slot) => (
        <th key={slot.id} scope="col" className="sticky top-0 z-20 h-6 w-44 min-w-44 max-w-44 bg-paper px-1.5 py-0 text-center font-mono font-normal">
          {slotLabel(project, slot.id)}
        </th>
      ))}
    </tr>
  )

  const rows = (side: Side) =>
    participants(project, side).map((person, i) => (
      <tr key={person.id} className={`h-6 ${i % 2 === 0 ? 'bg-stripe' : ''}`}>
        <th scope="row" className="sticky left-0 z-10 w-48 min-w-48 max-w-48 bg-inherit px-1.5 py-1 text-left align-middle font-semibold leading-snug">
          <Name who={names(person.id)} variant={side === 'team' ? 'full' : 'short'} />
        </th>
        {project.slots.map((slot) => {
          const meeting = meetingAt(index, side, slot.id, person.id)
          const off = !available(person.id, slot.id)
          const active = selected?.slot === slot.id && selected.anchor === person.id
          const state = meeting ? names(meeting[otherSide(side)]).name : off ? 'not available' : 'free'
          return (
            <td key={slot.id} className="w-44 min-w-44 max-w-44 p-0 align-middle">
              <button
                type="button"
                aria-pressed={active}
                aria-haspopup="dialog"
                aria-label={`${slotLabel(project, slot.id)}, ${person.name}: ${state}`}
                title={`${meeting ? `${state} · ${askedBy(asksFor(project, meeting))}` : state} · Click to edit`}
                onClick={() => onSelect({ slot: slot.id, side, anchor: person.id })}
                className={`flex min-h-6 w-full cursor-pointer items-center gap-1 px-1.5 py-1 text-left leading-snug hover:outline hover:outline-ink ${active ? 'outline-2 outline-accent' : ''} ${
                  off && !meeting ? 'hatched' : ''
                }`}
              >
                {meeting && (
                  <Booked
                    who={names(meeting[otherSide(side)])}
                    asked={asksFor(project, meeting)}
                    warning={index.byPair.get(pairKey(meeting.team, meeting.dm))!.length > 1 ? 'meets twice' : off ? 'not available' : null}
                  />
                )}
              </button>
            </td>
          )
        })}
      </tr>
    ))

  return (
    <div className="max-h-[75vh] overflow-auto">
      <table className="w-full border-separate border-spacing-0">
        <tbody>
          {header('Decision makers')}
          {rows('dm')}
        </tbody>
        <tbody aria-hidden="true">
          <tr>
            <td className="h-6" colSpan={project.slots.length + 1} />
          </tr>
        </tbody>
        <tbody>
          {header('Teams')}
          {rows('team')}
        </tbody>
      </table>
    </div>
  )
}

/** Full film titles, compact DM labels, request marks and problem flags. */
function Booked({ who, asked, warning }: { who: ParticipantName; asked: Asked; warning: 'meets twice' | 'not available' | null }) {
  return (
    <>
      <RequestMark {...asked} />
      <Name who={who} variant={who.side === 'team' ? 'full' : 'code'} className={asked.dm || asked.team ? '' : 'text-muted'} />
      {warning && (
        <span aria-label={warning} className="ml-auto pl-1 font-bold text-warn">
          {warning === 'meets twice' ? '×2' : '!'}
        </span>
      )}
    </>
  )
}
