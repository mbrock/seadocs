import { useMemo, useState, type ReactNode } from 'react'
import { measure, OBJECTIVES, requestedCounts, sameObjectives, type ObjectiveKey, type Objectives } from '../lib/objectives'
import { describe, isAsk, nameAlternatives, type AlternativeName } from '../lib/describe'
import type { Alternative } from '../lib/optimize'
import type { PlacedMeeting } from '../lib/scheduler'
import type { Project } from '../lib/project'
import { Button } from './ui'

const meetingsKey = (ms: PlacedMeeting[]) =>
  ms
    .map((m) => `${m.slot}|${m.team}|${m.dm}`)
    .sort()
    .join(',')

interface Props {
  project: Project
  /** The frontier for the current input; empty when there is nobody to schedule. */
  alternatives: Alternative[]
  onPick: (meetings: PlacedMeeting[]) => void
}

/**
 * The strip under the board header: which board is on screen and how good it
 * is, with the alternatives folded away behind "Compare". Each alternative is
 * a genuinely different trade — nothing on the list beats anything else on
 * every count — named by what it gains and what it costs.
 */
export function Frontier({ project, alternatives, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const requested = useMemo(() => requestedCounts(project), [project])
  const current = useMemo(() => measure(project, project.meetings), [project])

  if (alternatives.length === 0) {
    return (
      <Strip>
        <span className="text-muted">{describe(current, requested)}</span>
      </Strip>
    )
  }

  const currentKey = meetingsKey(project.meetings)
  const selected = alternatives.findIndex((a) => meetingsKey(a.meetings) === currentKey)
  const names = nameAlternatives(alternatives)
  const edited = selected < 0
  const others = alternatives.length - 1

  return (
    <>
      <Strip>
        <span className="min-w-0">
          <b>{edited ? 'Your board' : names[selected].name}</b>
          <span className="text-muted"> — {describe(current, requested)}</span>
          {!edited && selected > 0 && names[selected].cost && <span className="text-muted"> · {names[selected].cost}</span>}
        </span>
        <span className="flex items-center gap-1">
          {edited && (
            <Button variant="quiet" onClick={() => onPick(alternatives[0].meetings)} title="Replace this board with the one the solver recommends for the current input">
              Use recommended
            </Button>
          )}
          {(others > 0 || edited) && (
            <Button variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Hide' : others > 0 ? `Compare ${others} other ${others === 1 ? 'board' : 'boards'}` : 'Compare with recommended'} {open ? '▴' : '▾'}
            </Button>
          )}
        </span>
      </Strip>
      {open && <Table alternatives={alternatives} names={names} selected={selected} current={edited ? current : null} requested={requested} onPick={onPick} />}
    </>
  )
}

function Strip({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule bg-canvas px-3 py-1.5 text-[0.85rem]">{children}</div>
}

function Table({
  alternatives,
  names,
  selected,
  current,
  requested,
  onPick,
}: {
  alternatives: Alternative[]
  names: AlternativeName[]
  selected: number
  current: Objectives | null
  requested: Partial<Record<ObjectiveKey, number>>
  onPick: (meetings: PlacedMeeting[]) => void
}) {
  const best: Objectives = { ...alternatives[0].objectives }
  for (const a of alternatives) for (const { key } of OBJECTIVES) best[key] = Math.min(best[key], a.objectives[key])
  // Columns where every board is perfect carry no information; drop them.
  const columns = OBJECTIVES.filter(({ key }) => alternatives.some((a) => a.objectives[key] > 0) || (current?.[key] ?? 0) > 0)
  const show = (key: ObjectiveKey, v: number) => (isAsk(key) ? `${(requested[key] ?? 0) - v}/${requested[key] ?? 0}` : String(v))

  const th = 'px-2 py-1.5 text-right text-[0.7rem] font-semibold text-muted whitespace-nowrap'
  const td = 'px-2 py-1.5 text-right text-[0.8rem] tabular-nums'
  const row = (active: boolean) => `border-t border-rule ${active ? 'bg-accent-soft' : 'hover:bg-canvas'}`
  return (
    <div className="overflow-auto border-b border-rule">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Click a board to put it on screen</th>
            {columns.map((o) => (
              <th key={o.key} className={th} title={isAsk(o.key) ? `${o.hint} — shown as met / asked` : o.hint}>
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
              className={`cursor-pointer ${row(i === selected)}`}
            >
              <td className="px-2 py-1.5 text-[0.85rem] whitespace-nowrap">
                <span className="font-semibold">{names[i].name}</span>
                {names[i].gain && <span className="text-muted"> · {names[i].gain}</span>}
                {names[i].cost && <span className="text-muted"> · {names[i].cost}</span>}
                {i === selected && <span className="ml-2 text-[0.7rem] font-semibold tracking-[0.06em] text-accent uppercase">on screen</span>}
              </td>
              {columns.map(({ key }) => (
                <td key={key} className={`${td} ${a.objectives[key] === best[key] ? 'font-bold text-accent' : ''}`}>
                  {show(key, a.objectives[key])}
                </td>
              ))}
            </tr>
          ))}
          {current && (
            <tr className={row(true)}>
              <td className="px-2 py-1.5 text-[0.85rem] font-semibold whitespace-nowrap">
                Your board
                <span className="ml-2 text-[0.7rem] font-semibold tracking-[0.06em] text-accent uppercase">on screen</span>
                {alternatives.some((a) => sameObjectives(a.objectives, current)) && (
                  <span className="ml-2 text-[0.7rem] font-normal text-muted">same counts as a generated board</span>
                )}
              </td>
              {columns.map(({ key }) => (
                <td key={key} className={`${td} ${current[key] < best[key] ? 'font-bold text-accent' : current[key] > best[key] ? 'text-warn' : ''}`}>
                  {show(key, current[key])}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
