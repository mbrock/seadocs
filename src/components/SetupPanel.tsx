import { asksFor, participants, rosterLine, withAsk, withNewParticipant, withoutParticipant, withRosterLine, type Project } from '../lib/project'
import { otherSide, pairKey, pairOf, type Side } from '../lib/scheduler'
import { Button, Name, RequestMark, type UpdateProject } from './ui'
import { sideStyle, useNames, type ParticipantName } from './useNames'

interface Props {
  project: Project
  onChange: UpdateProject
}

/** Two request matrices, one per side. Each side edits its own roster down the left. */
export function SetupPanel({ project, onChange }: Props) {
  return (
    <>
      <RequestMatrix side="dm" project={project} onChange={onChange} />
      <RequestMatrix side="team" project={project} onChange={onChange} />
    </>
  )
}

const rowLabel: Record<Side, string> = { dm: 'DM', team: 'team' }
const addLabel: Record<Side, string> = { dm: '+ DM', team: '+ film team' }
const placeholder: Record<Side, string> = { dm: 'Name | Organisation, Country', team: 'Film team' }

/** One side's requests: its people down the rows, the other side across the columns. */
function RequestMatrix({ side, project, onChange }: Props & { side: Side }) {
  const names = useNames(project)
  const rows = participants(project, side)
  const columns = participants(project, otherSide(side))
  const scheduled = new Set(project.meetings.map((m) => pairKey(m.team, m.dm)))
  // A 45° label rises by roughly 0.7 of its width; reserve what the longest one needs.
  const longestHeader = Math.max(0, ...columns.map((p) => names(p.id)).map(({ tag, code }) => Array.from(`${tag} ${code}`.trim()).length))
  const headerHeight = `${Math.max(5, 2.25 + longestHeader * 0.38)}rem`

  return (
    <section className="w-fit max-w-full min-w-0">
      <div className="overflow-auto pb-1">
        <table className="mr-16 w-max border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-paper">
            <tr>
              <th style={{ height: headerHeight }} className="sticky left-0 z-30 w-px bg-paper px-2 pb-1 text-left align-bottom whitespace-nowrap">
                <Button variant="quiet" onClick={() => onChange((p) => withNewParticipant(p, side))}>
                  {addLabel[side]}
                </Button>
              </th>
              {columns.map((p) => (
                <th key={p.id} style={{ height: headerHeight }} className="relative w-7 min-w-7 overflow-visible p-0 align-bottom font-normal">
                  <span className="absolute bottom-3 left-0 inline-flex origin-bottom-left -rotate-45 items-center whitespace-nowrap">
                    <span className="inline-flex translate-y-full pl-2">
                      <Name who={names(p.id)} variant="code" />
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((person, i) => (
              <tr key={person.id} className="group h-6">
                <th className="sticky left-0 z-10 w-px bg-paper px-2 py-0 text-left font-normal whitespace-nowrap group-hover:bg-canvas">
                  <RosterCell
                    who={names(person.id)}
                    variant={side === 'team' ? 'code' : 'short'}
                    line={rosterLine(person)}
                    label={`${rowLabel[side]} ${i + 1}`}
                    placeholder={placeholder[side]}
                    onChange={(line) => onChange((p) => withRosterLine(p, side, person.id, line))}
                    onDelete={() => onChange((p) => withoutParticipant(p, side, person.id))}
                  />
                </th>
                {columns.map((column) => {
                  const pair = pairOf(side, person.id, column.id)
                  const asked = asksFor(project, pair)
                  const requested = asked.dm || asked.team
                  const fulfilled = scheduled.has(pairKey(pair.team, pair.dm))
                  const description = `${side === 'dm' ? 'DM' : 'Team'} request: ${person.name} asks for ${column.name}`
                  return (
                    <td key={column.id} className="p-0 group-hover:bg-canvas/50">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={asked[side]}
                        aria-label={description}
                        title={`${description} · ${asked[side] ? (fulfilled ? 'scheduled' : 'not scheduled') : 'not requested'}`}
                        onClick={() => onChange((p) => withAsk(p, side, pair.team, pair.dm, !asked[side]))}
                        className={`flex h-6 w-full cursor-pointer items-center justify-center ${requested && !fulfilled ? 'opacity-45' : ''}`}
                      >
                        <RequestMark {...asked} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * A row heading that edits the participant's roster line. The input holds the
 * full line but shows it only while focused; at rest the short name sits on top
 * of it, and an invisible copy of that name gives the cell its width.
 */
function RosterCell({
  who,
  variant,
  line,
  label,
  placeholder,
  onChange,
  onDelete,
}: {
  who: ParticipantName
  variant: 'short' | 'code'
  line: string
  label: string
  placeholder: string
  onChange: (line: string) => void
  onDelete: () => void
}) {
  return (
    <div className="relative flex h-6 items-center gap-0.5">
      <input
        aria-label={label}
        className={`peer absolute inset-y-0 left-0 right-3 z-10 bg-transparent p-0 focus:bg-paper focus:text-ink focus:outline-1 focus:outline-ink ${sideStyle[who.side]} ${line ? 'text-transparent' : 'text-muted'}`}
        placeholder={placeholder}
        title={line}
        value={line}
        onChange={(e) => onChange(e.target.value)}
      />
      <span aria-hidden="true" className="invisible flex">
        {line ? <Name who={who} variant={variant} /> : placeholder}
      </span>
      {line && (
        <span className="pointer-events-none absolute inset-y-0 left-0 right-3 flex items-center peer-focus:hidden">
          <Name who={who} variant={variant} />
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
