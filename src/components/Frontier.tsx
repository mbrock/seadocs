import { useMemo } from 'react'
import { measure, OBJECTIVES, sameObjectives, type ObjectiveKey, type Objectives } from '../lib/objectives'
import type { Alternative } from '../lib/optimize'
import type { PlacedMeeting } from '../lib/scheduler'
import type { Project } from '../lib/project'

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

const SHORT: Record<ObjectiveKey, string> = {
  missedMust: 'must-meets missed',
  dmLoss: 'DM interest lost',
  teamsShort: 'teams short',
  dmGaps: 'DM windows',
  teamLoss: 'team interest lost',
  fillers: 'fillers',
  teamGaps: 'team windows',
}

const GAIN: Record<ObjectiveKey, string> = {
  missedMust: 'Fewer must-meets missed',
  dmLoss: 'More DM interest met',
  teamsShort: 'Fewer teams short',
  dmGaps: 'Fewer DM windows',
  teamLoss: 'More team interest met',
  fillers: 'Fewer fillers',
  teamGaps: 'Fewer team windows',
}

/**
 * Name each board by what it gains over the default: the highest-priority
 * objective where it does better. The default is best in priority order.
 */
export function nameAlternatives(alternatives: Alternative[]): string[] {
  const base = alternatives[0]?.objectives
  const used = new Map<string, number>()
  return alternatives.map((a, i) => {
    let name = 'Best for decision makers'
    if (i > 0) {
      const win = OBJECTIVES.find(({ key }) => a.objectives[key] < base[key])
      name = win ? GAIN[win.key] : `Board ${i + 1}`
    }
    const n = (used.get(name) ?? 0) + 1
    used.set(name, n)
    return n > 1 ? `${name} (${n})` : name
  })
}

/**
 * The Pareto frontier as a table: one row per board, one column per
 * objective, lower is better everywhere. The best value in each column is
 * marked. The row matching the board on screen is highlighted; if the board
 * has been edited by hand it gets its own row.
 */
export function Frontier({ project, alternatives, onPick }: Props) {
  const currentKey = meetingsKey(project.meetings)
  const selected = alternatives.findIndex((a) => meetingsKey(a.meetings) === currentKey)
  const current = useMemo(() => (selected < 0 && project.meetings.length ? measure(project, project.meetings) : null), [project, selected])
  const names = nameAlternatives(alternatives)
  const best: Objectives = { ...alternatives[0].objectives }
  for (const a of alternatives) for (const { key } of OBJECTIVES) best[key] = Math.min(best[key], a.objectives[key])
  // Columns where every board is 0 carry no information; drop them.
  const columns = OBJECTIVES.filter(({ key }) => alternatives.some((a) => a.objectives[key] > 0) || (current?.[key] ?? 0) > 0)

  const th = 'px-2 py-1.5 text-right text-[0.7rem] font-semibold text-muted whitespace-nowrap'
  const td = 'px-2 py-1.5 text-right font-mono text-[0.8rem] tabular-nums'
  const row = (active: boolean) => `border-t border-rule ${active ? 'bg-accent-soft' : 'hover:bg-canvas'}`
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} text-left`}>{alternatives.length === 1 ? 'One board beats all others' : `${alternatives.length} boards, none beats another`}</th>
            {columns.map((o) => (
              <th key={o.key} className={th} title={o.hint}>
                {SHORT[o.key]}
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
              className={`cursor-pointer ${row(i === selected)}`}
            >
              <td className="px-2 py-1.5 text-[0.85rem] font-semibold whitespace-nowrap">
                {names[i]}
                {i === selected && <span className="ml-2 font-mono text-[0.7rem] font-normal text-accent">on board</span>}
              </td>
              {columns.map(({ key }) => (
                <td key={key} className={`${td} ${a.objectives[key] === best[key] ? 'font-bold text-accent' : ''}`}>
                  {a.objectives[key]}
                </td>
              ))}
            </tr>
          ))}
          {current && (
            <tr className={row(true)}>
              <td className="px-2 py-1.5 text-[0.85rem] font-semibold whitespace-nowrap">
                Edited by hand
                {alternatives.some((a) => sameObjectives(a.objectives, current)) && (
                  <span className="ml-2 font-mono text-[0.7rem] font-normal text-muted">same scores as a generated board</span>
                )}
              </td>
              {columns.map(({ key }) => (
                <td key={key} className={`${td} ${current[key] < best[key] ? 'font-bold text-accent' : current[key] > best[key] ? 'text-warn' : ''}`}>
                  {current[key]}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
