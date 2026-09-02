import { useMemo } from 'react'
import { measure, OBJECTIVES, sameObjectives, type Objectives } from '../lib/objectives'
import type { Alternative } from '../lib/optimize'
import type { PlacedMeeting } from '../lib/scheduler'
import type { Project } from '../lib/state'
import { Hint } from './ui'

interface Props {
  project: Project
  alternatives: Alternative[]
  onPick: (meetings: PlacedMeeting[]) => void
}

const meetingsKey = (ms: PlacedMeeting[]) =>
  ms
    .map((m) => `${m.slot}|${m.team}|${m.dm}`)
    .sort()
    .join(',')

/**
 * The Pareto frontier as a table: one row per board, one column per
 * objective, lower is better everywhere. The best value in each column is
 * marked so the trade-offs jump out. The row matching the board on screen is
 * highlighted; if the board has been edited by hand it gets its own row.
 */
export function Alternatives({ project, alternatives, onPick }: Props) {
  const currentKey = meetingsKey(project.meetings)
  const selected = alternatives.findIndex((a) => meetingsKey(a.meetings) === currentKey)
  const current = useMemo(
    () => (selected < 0 && project.meetings.length ? measure(project, project.meetings) : null),
    [project, selected],
  )
  const best: Objectives = { ...alternatives[0].objectives }
  for (const a of alternatives) for (const { key } of OBJECTIVES) best[key] = Math.min(best[key], a.objectives[key])

  const th = 'border border-line bg-paper-dim px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-teal'
  const td = 'border border-line px-2 py-1.5 text-center font-mono text-[12px] tabular-nums'
  return (
    <div className="mt-4">
      <Hint className="mb-2">
        {alternatives.length === 1
          ? 'One board beats every other on every count.'
          : `${alternatives.length} boards, none of which beats another on every count. Lower is better in every column; the best value in each column is marked. The first row is the default (priorities left to right). Click a row to load it.`}
      </Hint>
      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Board</th>
              {OBJECTIVES.map((o) => (
                <th key={o.key} className={th} title={o.hint}>
                  {o.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alternatives.map((a, i) => (
              <tr
                key={i}
                role="button"
                tabIndex={0}
                aria-pressed={i === selected}
                onClick={() => onPick(a.meetings)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onPick(a.meetings)
                  }
                }}
                className={`cursor-pointer ${i === selected ? 'bg-amber-pale' : 'bg-cream hover:bg-paper-dim'}`}
              >
                <td className={`${td} text-left whitespace-nowrap`}>
                  {i === 0 ? 'Default' : `Alternative ${i}`}
                  {i === selected && <span className="ml-2 text-[10px] uppercase text-teal">on board</span>}
                </td>
                {OBJECTIVES.map(({ key }) => (
                  <td key={key} className={`${td} ${a.objectives[key] === best[key] ? 'font-bold text-teal' : ''}`}>
                    {a.objectives[key]}
                  </td>
                ))}
              </tr>
            ))}
            {current && (
              <tr className="bg-amber-pale">
                <td className={`${td} text-left whitespace-nowrap`}>
                  Current board <span className="ml-2 text-[10px] uppercase text-teal">edited by hand</span>
                </td>
                {OBJECTIVES.map(({ key }) => (
                  <td key={key} className={`${td} ${current[key] < best[key] ? 'font-bold text-teal' : ''}`}>
                    {current[key]}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {current && alternatives.some((a) => sameObjectives(a.objectives, current)) && (
        <Hint className="mt-2 mb-0">The edited board scores the same as one of the generated ones, just arranged differently.</Hint>
      )}
    </div>
  )
}
