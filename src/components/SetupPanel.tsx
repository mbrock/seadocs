import { asksFor, participants, withAsk, type Project } from '../lib/project'
import { otherSide, pairKey, pairOf, type Side } from '../lib/scheduler'
import { Name, RequestMark, type UpdateProject } from './ui'
import { useNames } from './useNames'

interface Props {
  project: Project
  onChange: UpdateProject
}

/** Two request matrices, one per side, with read-only roster headings. */
export function SetupPanel({ project, onChange }: Props) {
  return (
    <>
      <RequestMatrix side="dm" project={project} onChange={onChange} />
      <RequestMatrix side="team" project={project} onChange={onChange} />
    </>
  )
}

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
                {side === 'dm' ? 'Decision-maker requests' : 'Film-team requests'}
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
            {rows.map((person) => (
              <tr key={person.id} className="group h-6">
                <th className="sticky left-0 z-10 w-px bg-paper px-2 py-0 text-left font-normal whitespace-nowrap group-hover:bg-canvas">
                  <Name
                    who={names(person.id)}
                    variant={side === 'team' ? 'code' : 'short'}
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
