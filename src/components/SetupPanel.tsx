import type { Dispatch, SetStateAction } from 'react'
import { asked, pairKey, type Participant } from '../lib/scheduler'
import { parseRoster, prune, rosterText, withAsk, withAsks, type AskKind, type Project } from '../lib/project'
import { Button, Name } from './ui'
import { useNames } from './useNames'

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
    <div className="flex flex-col gap-3">
      <RequestMatrix
        kind="dm"
        title="Decision-maker requests"
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
        title="Team requests"
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
    </div>
  )
}

function RequestMatrix({
  kind,
  title,
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
  title: string
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
    <section className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="eyebrow text-ink">{title}</h2>
        <Button
          variant="quiet"
          disabled={Object.keys(asks).length === 0}
          onClick={() => onChange((current) => kind === 'dm' ? withAsks(current, {}, current.teamAsks) : withAsks(current, current.dmAsks, {}))}
        >
          Clear requests
        </Button>
      </div>
      <div className="overflow-auto pb-1">
        <table className="mr-16 w-max border-separate border-spacing-0 text-[0.8rem]">
          <thead className="sticky top-0 z-20 bg-paper">
            <tr>
              <th className="sticky left-0 z-30 h-20 w-52 max-w-52 border-b border-rule bg-paper px-2 pb-1 text-left align-bottom font-semibold">
                {rowSide === 'DM' ? 'Decision maker' : 'Team'}
              </th>
              {columns.map((person) => (
                <th key={person.id} className="relative h-20 w-12 min-w-12 overflow-visible p-0 align-bottom font-normal">
                  <span className="absolute bottom-0 left-0 inline-flex origin-bottom-left -rotate-[22deg] items-center border-b border-rule pl-2 whitespace-nowrap">
                    <Name person={person} display={names.get(person.id)} variant="code" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="outline outline-1 outline-rule">
            {rows.map((person, rowIndex) => (
              <tr key={person.id} className="group">
                <th className="sticky left-0 z-10 w-52 max-w-52 border-l border-b border-rule bg-paper px-2 py-1 text-left font-normal group-hover:bg-canvas">
                  <div className="flex items-center gap-0.5">
                    <input
                      aria-label={`${rowSide} ${rowIndex + 1}`}
                      className="w-0 min-w-0 flex-1 bg-transparent p-0 text-[0.8rem] focus:bg-paper focus:outline-1 focus:outline-ink"
                      placeholder={kind === 'dm' ? 'Name | Organisation, Country' : 'Film team'}
                      title={rosterText([person])}
                      value={rosterText([person])}
                      onChange={(event) => onEdit(person.id, event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${rowSide} ${rowIndex + 1}`}
                      title="Delete"
                      onClick={() => onDelete(person.id)}
                      className="shrink-0 px-0.5 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-warn"
                    >
                      ×
                    </button>
                  </div>
                </th>
                {columns.map((column) => {
                  const team = kind === 'dm' ? column.id : person.id
                  const dm = kind === 'dm' ? person.id : column.id
                  const requested = asked(asks, team, dm)
                  const fulfilled = requested && !generating && scheduled.has(pairKey(team, dm))
                  const description = `${kind === 'dm' ? 'DM' : 'Team'} request: ${person.name} asks for ${column.name}`
                  return (
                    <td key={column.id} className="border-l border-b border-rule/70 px-1.5 py-1 group-hover:bg-canvas/50">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={requested}
                        aria-label={description}
                        title={`${description} · ${requested ? fulfilled ? 'scheduled' : 'not scheduled' : 'not requested'}`}
                        onClick={() => onChange((current) => withAsk(current, kind, team, dm, !requested))}
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[2px] border text-[0.72rem] leading-none font-bold text-paper hover:outline hover:outline-ink ${
                          requested
                            ? kind === 'dm' ? 'border-emerald-600 bg-emerald-600' : 'border-sea-3 bg-sea-3'
                            : 'border-rule bg-paper'
                        }`}
                      >
                        {fulfilled ? '✓' : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-paper px-2 py-1">
                <Button variant="quiet" onClick={onAdd}>{addLabel}</Button>
              </td>
              <td colSpan={Math.max(1, columns.length)} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
