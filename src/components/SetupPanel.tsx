import type { Dispatch, SetStateAction } from 'react'
import { asked, pairKey, type Participant } from '../lib/scheduler'
import { parseRoster, prune, rosterText, withAsk, type AskKind, type Project } from '../lib/project'
import { Button, Name, RequestMark } from './ui'
import { useNames } from './useNames'
import type { DisplayName } from '../lib/names'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
  generating: boolean
}

type ParticipantSide = 'teams' | 'dms'

/** Two request matrices. Each side edits its own roster down the left. */
export function SetupPanel({ project, onChange, generating }: Props) {
  const names = useNames(project)
  const scheduled = new Set(project.meetings.map((meeting) => pairKey(meeting.team, meeting.dm)))

  const updateParticipant = (side: ParticipantSide, id: string, text: string) =>
    onChange((current) => {
      const parsed = parseRoster(text)[0] ?? { name: '', online: false }
      return {
        ...current,
        [side]: current[side].map((person) => {
          if (person.id !== id) return person
          const next: Participant = { id, name: parsed.name }
          if (parsed.online) next.online = true
          if (parsed.code) next.code = parsed.code
          if (person.unavailable?.length) next.unavailable = person.unavailable
          return next
        }),
      }
    })

  const addParticipant = (side: ParticipantSide) =>
    onChange((current) => {
      const prefix = side === 'teams' ? 't' : 'd'
      return {
        ...current,
        [side]: [...current[side], { id: `${prefix}${current.nextId}`, name: '' }],
        nextId: current.nextId + 1,
      }
    })

  const deleteParticipant = (side: ParticipantSide, id: string) =>
    onChange((current) => prune({ ...current, [side]: current[side].filter((person) => person.id !== id) }))

  return (
    <>
      <RequestMatrix
        kind="dm"
        rows={project.dms}
        columns={project.teams}
        project={project}
        names={names}
        scheduled={scheduled}
        generating={generating}
        onChange={onChange}
        onEdit={(id, text) => updateParticipant('dms', id, text)}
        onDelete={(id) => deleteParticipant('dms', id)}
        onAdd={() => addParticipant('dms')}
      />
      <RequestMatrix
        kind="team"
        rows={project.teams}
        columns={project.dms}
        project={project}
        names={names}
        scheduled={scheduled}
        generating={generating}
        onChange={onChange}
        onEdit={(id, text) => updateParticipant('teams', id, text)}
        onDelete={(id) => deleteParticipant('teams', id)}
        onAdd={() => addParticipant('teams')}
      />
    </>
  )
}

function RequestMatrix({
  kind,
  rows,
  columns,
  project,
  names,
  scheduled,
  generating,
  onChange,
  onEdit,
  onDelete,
  onAdd,
}: {
  kind: AskKind
  rows: Participant[]
  columns: Participant[]
  project: Project
  names: ReturnType<typeof useNames>
  scheduled: Set<string>
  generating: boolean
  onChange: Dispatch<SetStateAction<Project>>
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
}) {
  const rowSide = kind === 'dm' ? 'DM' : 'team'
  const addLabel = kind === 'dm' ? '+ DM' : '+ film team'
  const asks = kind === 'dm' ? project.dmAsks : project.teamAsks

  return (
    <section className="w-fit max-w-full min-w-0">
      <div className="overflow-auto pb-1">
        <table className="mr-16 w-max border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-paper">
            <tr>
              <th className="sticky left-0 z-30 h-20 w-px border-b border-rule bg-paper px-2 pb-1 text-left align-bottom font-semibold whitespace-nowrap">
                {rowSide === 'DM' ? 'Decision maker' : 'Team'}
              </th>
              {columns.map((person) => (
                <th key={person.id} className="relative h-20 w-7 min-w-7 overflow-visible p-0 align-bottom font-normal">
                  <span aria-hidden="true" className="absolute bottom-0 left-0 h-3 border-l border-rule" />
                  <span className="absolute bottom-3 left-0 inline-flex origin-bottom-left -rotate-45 items-center border-b border-rule whitespace-nowrap">
                    <span className="inline-flex translate-y-full pl-2">
                      <Name person={person} display={names.get(person.id)} variant="code" />
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="outline outline-1 outline-rule">
            {rows.map((person, rowIndex) => (
              <tr key={person.id} className="group h-6">
                <th className="sticky left-0 z-10 w-px border-l border-b border-rule bg-paper px-2 py-0 text-left font-normal whitespace-nowrap group-hover:bg-canvas">
                  <EditableParticipant
                    person={person}
                    display={names.get(person.id)}
                    variant={kind === 'team' ? 'code' : 'short'}
                    label={`${rowSide} ${rowIndex + 1}`}
                    placeholder={kind === 'dm' ? 'Name | Organisation, Country' : 'Film team'}
                    onChange={(text) => onEdit(person.id, text)}
                    onDelete={() => onDelete(person.id)}
                  />
                </th>
                {columns.map((column) => {
                  const team = kind === 'dm' ? column.id : person.id
                  const dm = kind === 'dm' ? person.id : column.id
                  const requested = asked(asks, team, dm)
                  const fulfilled = requested && !generating && scheduled.has(pairKey(team, dm))
                  const description = `${kind === 'dm' ? 'DM' : 'Team'} request: ${person.name} asks for ${column.name}`
                  return (
                    <td key={column.id} className="border-l border-b border-rule/70 p-0 group-hover:bg-canvas/50">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={requested}
                        aria-label={description}
                        title={`${description} · ${requested ? fulfilled ? 'scheduled' : 'not scheduled' : 'not requested'}`}
                        onClick={() => onChange((current) => withAsk(current, kind, team, dm, !requested))}
                        className="flex h-6 w-full cursor-pointer items-center justify-center hover:outline hover:outline-ink"
                      >
                        <RequestMark
                          dm={kind === 'dm' && requested}
                          team={kind === 'team' && requested}
                          fulfilled={fulfilled}
                          showEmpty
                          className={requested && !fulfilled ? 'opacity-45' : ''}
                        />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="h-[calc(1.5rem+1px)]">
              <td className="sticky left-0 z-10 border-b border-rule bg-paper px-2 py-0">
                <Button variant="quiet" onClick={onAdd}>{addLabel}</Button>
              </td>
              <td className="border-b border-rule" colSpan={Math.max(1, columns.length)} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EditableParticipant({
  person,
  display,
  variant,
  label,
  placeholder,
  onChange,
  onDelete,
}: {
  person: Participant
  display?: DisplayName
  variant: 'short' | 'code'
  label: string
  placeholder: string
  onChange: (text: string) => void
  onDelete: () => void
}) {
  const value = rosterText([person])
  return (
    <div className="relative flex h-6 items-center gap-0.5">
      <input
        aria-label={label}
        className={`peer absolute inset-y-0 left-0 right-3 z-10 min-w-0 bg-transparent p-0 focus:bg-paper focus:text-ink focus:outline-1 focus:outline-ink ${value ? 'text-transparent' : 'text-muted'}`}
        placeholder={placeholder}
        title={value}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span aria-hidden="true" className="invisible flex">
        <Name person={person} display={display} variant={variant} />
      </span>
      {value && (
        <span className="pointer-events-none absolute inset-y-0 left-0 right-3 flex items-center peer-focus:hidden">
          <Name person={person} display={display} variant={variant} className="flex" />
        </span>
      )}
      <button
        type="button"
        aria-label={`Delete ${label}`}
        title="Delete"
        onClick={onDelete}
        className="z-20 shrink-0 px-0.5 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-warn"
      >
        ×
      </button>
    </div>
  )
}
