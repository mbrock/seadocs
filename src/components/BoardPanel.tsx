import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  assignCell,
  assignEffect,
  computeStats,
  findIssues,
  indexMeetings,
  isRefused,
  pairKey,
  asked,
  rankOf,
  type AssignEffect,
  type Availability,
  type Id,
  type MeetingIndex,
  type Pair,
  type Participant,
  type PlacedMeeting,
  type Side,
  type Stats,
} from '../lib/scheduler'
import { availabilityOfProject, participantName, slotLabel, withAvailability, withMeetings, type Project } from '../lib/project'
import { boardCsv, download } from '../lib/csv'
import { optimize } from '../lib/optimize'
import { useNames } from './useNames'
import type { DisplayName } from '../lib/names'
import { Button, Empty, KeyItem, Name, OnlineMark, Panel, PanelHeader, AskPair, askTint, Segmented, Swatch } from './ui'
import { askedBy } from '../lib/describe'
import { startAdvancedSolve } from '../lib/advancedSolverClient'
import { validateAdvancedBoard, type AdvancedSolverResult } from '../lib/advancedSolver'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

/** A board cell: one slot for one participant on the `side` shown down the left. */
interface Cell {
  slot: Id
  side: Side
  anchor: Id
}

export function BoardPanel({ project, onChange }: Props) {
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const hasBoard = project.meetings.length > 0
  const [rows, setRows] = useState<Side>('dm')
  const [cell, setCell] = useState<Cell | null>(null)
  const [solveMode, setSolveMode] = useState<'quick' | 'optimal'>('quick')
  const [advancedStatus, setAdvancedStatus] = useState<string | null>(null)
  const [advancedRunning, setAdvancedRunning] = useState(false)
  const cancelAdvanced = useRef<(() => void) | null>(null)
  const advancedInputKey = useRef<string | null>(null)
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const names = useNames(project)
  const { teams, dms, dmAsks, teamAsks, slots } = project
  const available = useMemo(() => availabilityOfProject({ teams, dms }), [teams, dms])
  const stats = useMemo(() => computeStats(project, project.meetings), [project])
  const issues = useMemo(() => findIssues(project.meetings, available), [project.meetings, available])
  // The old scheduler is deliberately invisible: only an incumbent hint and
  // emergency fallback if local WASM cannot return a valid solution.
  const fallbackHint = useMemo(
    () => (hasPeople ? (optimize({ teams, dms, dmAsks, teamAsks, slots })[0]?.meetings ?? []) : []),
    [hasPeople, teams, dms, dmAsks, teamAsks, slots],
  )
  const hasRequests = Object.keys(dmAsks).length + Object.keys(teamAsks).length > 0

  // Forget the selection when its slot or participant disappears.
  const cellValid =
    cell !== null &&
    project.slots.some((s) => s.id === cell.slot) &&
    (cell.side === 'dm' ? project.dms : project.teams).some((p) => p.id === cell.anchor)
  const selected = cellValid ? cell : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCell(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setMeetings = (meetings: PlacedMeeting[]) => onChange((p) => withMeetings(p, meetings))
  const inputKey = JSON.stringify([teams, dms, dmAsks, teamAsks, slots, project.meetings])

  useEffect(() => {
    if (cancelAdvanced.current && advancedInputKey.current !== inputKey) {
      cancelAdvanced.current?.()
      cancelAdvanced.current = null
      setAdvancedRunning(false)
      setAdvancedStatus('Solve cancelled because the scheduling input changed · board unchanged')
    }
  }, [inputKey])

  useEffect(() => () => cancelAdvanced.current?.(), [])

  const applyFallback = (reason: string) => {
    if (fallbackHint.length) setMeetings(fallbackHint)
    setAdvancedStatus(`Fallback schedule used — ${reason}`)
    setAdvancedRunning(false)
  }
  const advancedResult = (result: AdvancedSolverResult) => {
    cancelAdvanced.current = null
    setAdvancedRunning(false)
    if (!result.meetings || (result.kind !== 'optimal' && result.kind !== 'feasible')) {
      applyFallback(result.message ?? 'the local CP-SAT solver returned no valid board')
      return
    }
    const errors = validateAdvancedBoard({ teams, dms, dmAsks, teamAsks, slots }, result.meetings)
    if (errors.length) {
      applyFallback(`the local solver result was rejected (${errors[0]})`)
      return
    }
    setMeetings(result.meetings)
    const seconds = (result.runtimeMs / 1000).toFixed(1)
    setAdvancedStatus(result.kind === 'optimal' ? `OPTIMAL · all objective stages proven · ${seconds}s` : `FEASIBLE · time-limited, some objective stages unproven · ${seconds}s`)
  }
  const runAdvanced = () => {
    cancelAdvanced.current?.()
    setAdvancedRunning(true)
    setAdvancedStatus(solveMode === 'optimal' ? 'Proving every objective stage optimal… no time limit; the current board stays until proof completes.' : 'Solving locally… the current board stays until a valid result is ready.')
    advancedInputKey.current = inputKey
    cancelAdvanced.current = startAdvancedSolve(
      { teams, dms, dmAsks, teamAsks, slots, currentBoard: project.meetings, fallbackHint, proveOptimal: solveMode === 'optimal', maxTimeMs: 3000 },
      advancedResult,
      (message) => {
        cancelAdvanced.current = null
        applyFallback(message)
      },
    )
  }
  const stopAdvanced = () => {
    cancelAdvanced.current?.()
    cancelAdvanced.current = null
    setAdvancedRunning(false)
    setAdvancedStatus('Solve cancelled · board unchanged')
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel className="min-w-0">
        <PanelHeader title={hasBoard ? `Board · ${project.meetings.length} meetings` : 'Board'}>
          {hasBoard && <Key />}
          {hasBoard && (
            <Segmented
              label="Rows"
              size="sm"
              value={rows}
              onChange={(v) => {
                setRows(v)
                setCell(null)
              }}
              options={[
                { value: 'dm', label: 'Decision makers' },
                { value: 'team', label: 'Teams' },
              ]}
            />
          )}
          <Segmented
            label="Solve mode"
            size="sm"
            value={solveMode}
            onChange={setSolveMode}
            options={[
              { value: 'quick', label: 'Quick', title: 'Return the best valid schedule found in about three seconds' },
              { value: 'optimal', label: 'Prove optimal', title: 'Run without a time limit until every objective stage is proven optimal' },
            ]}
          />
          {advancedRunning ? (
            <Button onClick={stopAdvanced}>Cancel</Button>
          ) : (
            <Button
              variant="primary"
              disabled={!hasPeople || !hasRequests}
              title="Generate locally with CP-SAT; no data is uploaded"
              onClick={runAdvanced}
            >
              Generate
            </Button>
          )}
          <Button
            disabled={!hasBoard || issues.length > 0}
            title={issues.length > 0 ? 'Fix the problems first' : 'Download the board as a spreadsheet'}
            onClick={() => download('meeting-board.csv', boardCsv(project), 'text/csv')}
          >
            CSV
          </Button>
        </PanelHeader>
        {advancedStatus && (
          <div role="status" className="border-b border-rule bg-accent-soft px-3 py-1.5 text-[0.8rem]">
            {advancedStatus} · runs only in this browser; no data is uploaded
          </div>
        )}
        {hasBoard ? (
          <Grid project={project} names={names} index={index} available={available} rows={rows} selected={selected} onSelect={setCell} />
        ) : (
          <Empty>
            {!hasPeople
              ? 'Add people and interest first.'
              : !hasRequests
                ? 'Nobody has asked for a meeting yet — fill in the interest grid.'
                : 'Generate builds the board from the interest grids.'}
          </Empty>
        )}
      </Panel>

      <aside className={selected ? 'rounded-[4px] border border-rule bg-paper' : ''}>
        {selected ? (
          <Inspector
            project={project}
            names={names}
            index={index}
            available={available}
            cell={selected}
            onAssign={setMeetings}
            onAvailability={(id, slot, ok) => onChange((p) => withAvailability(p, id, slot, ok))}
            onClose={() => setCell(null)}
          />
        ) : (
          <NotScheduled project={project} names={names} index={index} available={available} stats={stats} hasBoard={hasBoard} />
        )}
      </aside>
    </div>
  )
}

/** Bar at the cell's right edge: the team asked for this meeting. */
function TeamBar({ show, className = '' }: { show: boolean; className?: string }) {
  if (!show) return null
  return <span aria-hidden className={`h-full w-[3px] bg-sea-3 ${className}`} />
}

/** Rows = one side (decision makers or teams), columns = slots. */
function Grid({
  project,
  names,
  index,
  available,
  rows,
  selected,
  onSelect,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  available: Availability
  rows: Side
  selected: Cell | null
  onSelect: (c: Cell) => void
}) {
  const people: Participant[] = rows === 'dm' ? project.dms : project.teams
  const partners: Participant[] = rows === 'dm' ? project.teams : project.dms
  const partnerById = new Map(partners.map((p) => [p.id, p]))
  const meetingAt = (slot: Id, id: Id) => (rows === 'dm' ? index.byCell.get(`${slot}|${id}`) : index.byTeamSlot.get(`${slot}|${id}`))
  const partnerOf = (m: PlacedMeeting) => partnerById.get(rows === 'dm' ? m.team : m.dm)
  return (
    <div className="max-h-[75vh] overflow-auto">
      {/* Fixed layout: the name column is 8.5rem, slots share the rest, and the table can't grow past the panel unless it has to. */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-[0.8rem]" style={{ minWidth: `${8.5 + 5.5 * project.slots.length}rem` }}>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 w-[8.5rem] border-r border-b border-rule bg-paper" />
            {project.slots.map((slot) => (
              <th key={slot.id} className="sticky top-0 z-20 border-r border-b border-rule bg-paper px-1.5 py-1 text-left font-mono text-[0.75rem] font-semibold">
                {slotLabel(project, slot.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-b border-rule bg-paper px-1.5 py-0 text-left text-[0.78rem] font-semibold whitespace-nowrap"
              >
                <Name person={person} display={names.get(person.id)} className="flex" />
              </th>
              {project.slots.map((slot) => {
                const m = meetingAt(slot.id, person.id)
                const partner = m ? partnerOf(m) : undefined
                const dmAsked = m ? asked(project.dmAsks, m.team, m.dm) : false
                const teamAsked = m ? asked(project.teamAsks, m.team, m.dm) : false
                const off = !available(person.id, slot.id)
                // Only a loaded file can contain a repeat; the editor refuses to create one.
                const repeat = m ? (index.byPair.get(pairKey(m.team, m.dm))?.length ?? 0) > 1 : false
                const active = selected?.slot === slot.id && selected.anchor === person.id
                const state = partner ? partner.name : off ? 'not available' : 'free'
                return (
                  <td key={slot.id} className="border-r border-b border-rule/70 p-0">
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`${slotLabel(project, slot.id)}, ${person.name}: ${state}`}
                      title={partner ? `${partner.name} · ${askedBy(dmAsked, teamAsked)}` : state}
                      onClick={() => onSelect({ slot: slot.id, side: rows, anchor: person.id })}
                      className={`relative flex h-7 w-full cursor-pointer items-center px-1.5 text-left text-[0.75rem] hover:outline hover:outline-ink ${
                        active ? 'outline-2 outline-accent' : ''
                      } ${off && !partner ? 'hatched' : dmAsked ? askTint.dm : ''} ${partner ? '' : 'text-faint'} ${
                        partner && !dmAsked && !teamAsked ? 'text-muted' : ''
                      }`}
                    >
                      {partner ? <Name person={partner} display={names.get(partner.id)} variant="code" className="flex" /> : off ? null : <span>·</span>}
                      {(repeat || (off && partner)) && (
                        <span aria-label={repeat ? 'meets twice' : 'not available'} className="ml-auto pl-1 text-[0.65rem] font-bold text-warn">
                          {repeat ? '×2' : '!'}
                        </span>
                      )}
                      <TeamBar show={teamAsked} className="absolute top-0 right-0" />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What the cell colours mean: gold tint = the decision maker asked; the bar at the right edge = the team asked. */
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <KeyItem swatch={<Swatch className={askTint.dm} />}>DM asked</KeyItem>
      <KeyItem
        swatch={
          <span className="relative inline-flex h-3 w-3 border border-rule">
            <TeamBar show className="absolute top-0 right-0" />
          </span>
        }
      >
        team asked
      </KeyItem>
      <KeyItem swatch={<Swatch className="bg-paper" />}>nobody asked</KeyItem>
      <KeyItem swatch={<Swatch className="hatched" />}>not available</KeyItem>
    </div>
  )
}

/** The selected cell: who is there, and everyone who could be, with what it would do. */
function Inspector({
  project,
  names,
  index,
  available,
  cell,
  onAssign,
  onAvailability,
  onClose,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  available: Availability
  cell: Cell
  onAssign: (m: PlacedMeeting[]) => void
  onAvailability: (id: Id, slot: Id, available: boolean) => void
  onClose: () => void
}) {
  const { slot, side, anchor } = cell
  const other: Side = side === 'dm' ? 'team' : 'dm'
  const anchorPerson = (side === 'dm' ? project.dms : project.teams).find((p) => p.id === anchor)!
  const candidates: Participant[] = other === 'team' ? project.teams : project.dms
  const meeting = side === 'dm' ? index.byCell.get(`${slot}|${anchor}`) : index.byTeamSlot.get(`${slot}|${anchor}`)
  const current = meeting ? meeting[other] : null
  const anchorOff = !available(anchor, slot)
  const time = slotLabel(project, slot)
  const asksFor = (team: Id, dm: Id) => ({ dm: asked(project.dmAsks, team, dm), team: asked(project.teamAsks, team, dm) })
  const pairWith = (partner: Id) => (side === 'dm' ? { team: partner, dm: anchor } : { team: anchor, dm: partner })
  const load = new Map<Id, number>()
  for (const m of project.meetings) load.set(m[other], (load.get(m[other]) ?? 0) + 1)

  const all: CandidateRow[] = candidates
    .filter((c) => c.id !== current)
    .map((c) => {
      const p = pairWith(c.id)
      const a = asksFor(p.team, p.dm)
      return { person: c, dmAsked: a.dm, teamAsked: a.team, rank: (a.dm ? 2 : 0) + (a.team ? 1 : 0), effect: assignEffect(project.meetings, slot, side, anchor, c.id, available) }
    })
    // Strongest request first.
    .sort((a, b) => b.rank - a.rank || a.person.name.localeCompare(b.person.name))
  // Candidates that cannot be picked are counted, not listed: a pair meets at most once, and nobody is booked when they are away.
  const rows = all.filter((r) => !isRefused(r.effect))
  const alreadyMet = all.filter((r) => r.effect.kind === 'repeat').length
  const away = all.filter((r) => r.effect.kind === 'unavailable').length
  const requested = rows.filter((r) => r.rank > 0)
  const unrequested = rows.filter((r) => r.rank === 0)

  const assign = (partner: Id | null) => onAssign(assignCell(project.meetings, slot, side, anchor, partner, available))
  const cur = current ? asksFor(pairWith(current).team, pairWith(current).dm) : null
  const code = (id: Id) => names.get(id)?.code ?? participantName(project, id)
  const anchorCode = code(anchor)

  /** One line on what picking this candidate does to the rest of the board. */
  const effectLine = (e: AssignEffect): ReactNode => {
    switch (e.kind) {
      case 'clear':
      case 'free':
        return 'free now'
      case 'move':
        return (
          <>
            moves from {code(e.displaced)} <span className="text-warn">· leaves {code(e.displaced)} free</span>
          </>
        )
      case 'swap':
        return (
          <>
            swap · {code(e.displaced)} gets {code(e.second[other])} <AskPair {...asksFor(e.second.team, e.second.dm)} />
          </>
        )
      case 'repeat':
      case 'unavailable':
        return null
    }
  }
  const list = (list: CandidateRow[]) => <CandidateList rows={list} project={project} names={names} onPick={assign} load={load} effectLine={effectLine} />

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-rule px-3 py-3">
        <div className="min-w-0">
          <div className="eyebrow">{time}</div>
          <div className="truncate text-[1rem] font-bold" title={anchorPerson.name}>
            {anchorPerson.name}
            <OnlineMark show={anchorPerson.online} />
          </div>
        </div>
        <Button variant="quiet" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      {anchorOff ? (
        <div className="px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Not available at {time}</div>
              <div className="text-[0.8rem] text-muted">No meeting is booked here.</div>
            </div>
            <Button onClick={() => onAvailability(anchor, slot, true)}>Available again</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-rule px-3 py-3">
            {current && cur ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">Meets</div>
                  <div className="truncate font-semibold">{participantName(project, current)}</div>
                  <div className="flex items-center gap-1.5 text-[0.8rem] text-muted">
                    <AskPair dm={cur.dm} team={cur.team} /> {askedBy(cur.dm, cur.team)}
                  </div>
                </div>
                <Button onClick={() => assign(null)} title="Take this meeting off the board">
                  Remove
                </Button>
              </div>
            ) : (
              <div className="text-muted">Free</div>
            )}
          </div>

          <div className="px-3 py-3">
            <div className="eyebrow mb-1">{current ? 'Replace with' : 'Book'}</div>
            {list(requested)}
            {unrequested.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[0.8rem] text-muted">{unrequested.length} nobody asked for</summary>
                {list(unrequested)}
              </details>
            )}
            {(alreadyMet > 0 || away > 0) && (
              <p className="mt-2 text-[0.75rem] text-muted">
                Not listed:{' '}
                {[alreadyMet > 0 && `${alreadyMet} already meet ${anchorCode} today`, away > 0 && `${away} not available at ${time}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="border-t border-rule px-3 py-2">
            <Button variant="quiet" onClick={() => onAvailability(anchor, slot, false)} title="Blocks this slot; any meeting here is removed">
              {anchorCode} can't do {time}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

interface CandidateRow {
  person: Participant
  dmAsked: boolean
  teamAsked: boolean
  rank: number
  effect: AssignEffect
}

function CandidateList({
  rows,
  project,
  names,
  onPick,
  load,
  effectLine,
}: {
  rows: CandidateRow[]
  project: Project
  names: Map<Id, DisplayName>
  onPick: (id: Id) => void
  load: Map<Id, number>
  effectLine: (e: AssignEffect) => ReactNode
}) {
  if (!rows.length) return <p className="py-1 text-[0.8rem] text-muted">Nobody.</p>
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => (
        <li key={r.person.id}>
          <button
            type="button"
            onClick={() => onPick(r.person.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 py-1.5 text-left hover:bg-canvas"
          >
            <span className="min-w-0">
              <Name person={r.person} display={names.get(r.person.id)} className="flex text-[0.88rem] font-semibold" />
              <span className="block text-[0.75rem] text-muted">
                {effectLine(r.effect)} · {load.get(r.person.id) ?? 0}/{project.slots.length} booked
              </span>
            </span>
            <AskPair dm={r.dmAsked} team={r.teamAsked} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Requested meetings that did not fit, shown below the full-width board. */
function NotScheduled({
  project,
  names,
  index,
  available,
  stats,
  hasBoard,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  available: Availability
  stats: Stats
  hasBoard: boolean
}) {
  if (!hasBoard) return null
  const name = (id: Id) => names.get(id)?.code ?? participantName(project, id)
  const label = (slot: Id) => slotLabel(project, slot)

  // Why a requested pair got no meeting: who is full, or where they could still fit.
  const load = new Map<Id, number>()
  for (const m of project.meetings) {
    load.set(m.team, (load.get(m.team) ?? 0) + 1)
    load.set(m.dm, (load.get(m.dm) ?? 0) + 1)
  }
  const canDo = (id: Id) => project.slots.filter((s) => available(id, s.id)).length
  const full = (id: Id) => (load.get(id) ?? 0) >= canDo(id)
  const why = (p: Pair): string => {
    if (full(p.dm) && full(p.team)) return 'both full'
    if (full(p.dm)) return 'DM full'
    if (full(p.team)) return 'team full'
    const open = project.slots.find(
      (s) => available(p.dm, s.id) && available(p.team, s.id) && !index.byCell.has(`${s.id}|${p.dm}`) && !index.byTeamSlot.has(`${s.id}|${p.team}`),
    )
    return open ? `both free at ${label(open.id)}` : 'no slot free for both'
  }

  return (
    <Panel>
      <PanelHeader title={`Not scheduled · ${stats.unmet.length}`} />
      <div className="px-3 py-3">
        {stats.unmet.length === 0 ? (
          <p className="text-[0.8rem] text-muted">Every request got a meeting.</p>
        ) : (
          <ul className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
            {stats.unmet.map((p) => (
              <li key={pairKey(p.team, p.dm)} className="flex min-w-0 items-center justify-between gap-3 border-b border-rule py-2" title={`rank ${rankOf(p)}`}>
                <span className="min-w-0 text-[0.82rem]">
                  <span className="block truncate font-semibold">
                    {p.dmAsked ? (
                      <>
                        {name(p.dm)} <span className="text-muted">→</span> {name(p.team)}
                      </>
                    ) : (
                      <>
                        {name(p.team)} <span className="text-muted">→</span> {name(p.dm)}
                      </>
                    )}
                  </span>
                  <span className="block truncate text-[0.72rem] text-muted">{why(p)}</span>
                </span>
                <AskPair dm={p.dmAsked} team={p.teamAsked} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
