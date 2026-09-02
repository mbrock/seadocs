import { useEffect, useEffectEvent, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  assignCell,
  assignEffect,
  indexMeetings,
  isRefused,
  pairKey,
  asked,
  type AssignEffect,
  type Availability,
  type Id,
  type MeetingIndex,
  type Participant,
  type PlacedMeeting,
  type Side,
} from '../lib/scheduler'
import { availabilityOfProject, participantName, slotLabel, withAvailability, withMeetings, type Project } from '../lib/project'
import { optimize } from '../lib/optimize'
import { useNames } from './useNames'
import type { DisplayName } from '../lib/names'
import { Button, Empty, Name, OnlineMark, Panel, AskPair } from './ui'
import { askedBy } from '../lib/describe'
import { startAdvancedSolve } from '../lib/advancedSolverClient'
import { validateAdvancedBoard } from '../lib/advancedSolver'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
  onGeneratedMeetings: (meetings: PlacedMeeting[]) => void
  onGeneratingChange: (generating: boolean) => void
}

/** A board cell: one slot for one participant on the `side` shown down the left. */
interface Cell {
  slot: Id
  side: Side
  anchor: Id
}

interface BoardData {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  available: Availability
}

export function BoardPanel({ project, onChange, onGeneratedMeetings, onGeneratingChange }: Props) {
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const hasBoard = project.meetings.length > 0
  const [cell, setCell] = useState<Cell | null>(null)
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const names = useNames(project)
  const { teams, dms, dmAsks, teamAsks, slots } = project
  const available = useMemo(() => availabilityOfProject({ teams, dms }), [teams, dms])
  // The old scheduler is deliberately invisible: only an incumbent hint and
  // emergency fallback if local WASM cannot return a valid solution.
  const fallbackHint = useMemo(
    () => (hasPeople ? (optimize({ teams, dms, dmAsks, teamAsks, slots })[0]?.meetings ?? []) : []),
    [hasPeople, teams, dms, dmAsks, teamAsks, slots],
  )
  const hasRequests = Object.keys(dmAsks).length + Object.keys(teamAsks).length > 0
  const solveKey = JSON.stringify([
    teams.map(({ id, unavailable }) => [id, unavailable]),
    dms.map(({ id, unavailable }) => [id, unavailable]),
    Object.keys(dmAsks).sort(),
    Object.keys(teamAsks).sort(),
    slots.map(({ id }) => id),
  ])

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

  const startSolve = useEffectEvent(() => {
    if (!hasPeople || !hasRequests) {
      if (project.meetings.length) onGeneratedMeetings([])
      onGeneratingChange(false)
      return
    }

    const input = { teams, dms, dmAsks, teamAsks, slots }
    let active = true
    onGeneratingChange(true)
    const finishWithFallback = (reason: string) => {
      if (!active) return
      onGeneratedMeetings(fallbackHint)
      onGeneratingChange(false)
      console.warn(`[CP-SAT] fallback schedule used · ${reason}`)
    }
    const cancel = startAdvancedSolve(
      {
        ...input,
        currentBoard: project.meetings,
        fallbackHint,
      },
      (result) => {
        if (!active) return
        if (!result.meetings || (result.kind !== 'optimal' && result.kind !== 'feasible')) {
          finishWithFallback(result.message ?? 'the local CP-SAT solver returned no valid board')
          return
        }
        const errors = validateAdvancedBoard(input, result.meetings)
        if (errors.length) {
          finishWithFallback(`the local solver result was rejected (${errors[0]})`)
          return
        }
        onGeneratedMeetings(result.meetings)
        onGeneratingChange(false)
      },
      finishWithFallback,
    )
    return () => {
      active = false
      cancel()
    }
  })

  useEffect(() => startSolve(), [solveKey])

  const board = { project, names, index, available }

  return (
    <div className="flex flex-col gap-2">
      {hasBoard ? (
        <>
          <Panel className="min-w-0">
            <Grid board={board} rows="dm" selected={selected} onSelect={setCell} />
          </Panel>
          <Panel className="min-w-0">
            <Grid board={board} rows="team" selected={selected} onSelect={setCell} />
          </Panel>
        </>
      ) : (
        <Panel className="min-w-0">
          <Empty>
            {!hasPeople
              ? 'Add people and requests first.'
              : !hasRequests
                ? 'Nobody has asked for a meeting yet.'
                : 'Building the board…'}
          </Empty>
        </Panel>
      )}

      {selected && (
        <aside className="rounded-[4px] border border-rule bg-paper">
          <Inspector
            board={board}
            cell={selected}
            onAssign={setMeetings}
            onAvailability={(id, slot, ok) => onChange((p) => withAvailability(p, id, slot, ok))}
            onClose={() => setCell(null)}
          />
        </aside>
      )}
    </div>
  )
}

/** Rows = one side (decision makers or teams), columns = slots. */
function Grid({
  board,
  rows,
  selected,
  onSelect,
}: {
  board: BoardData
  rows: Side
  selected: Cell | null
  onSelect: (c: Cell) => void
}) {
  const { project, names, index, available } = board
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
            <th className="sticky top-0 left-0 z-30 w-[8.5rem] border-r border-b border-rule bg-paper px-1.5 py-0.5 text-left text-[0.72rem] font-semibold">
              {rows === 'dm' ? 'Decision makers' : 'Teams'}
            </th>
            {project.slots.map((slot) => (
              <th key={slot.id} className="sticky top-0 z-20 border-r border-b border-rule bg-paper px-1.5 py-0.5 text-left font-mono text-[0.75rem] font-semibold">
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
                      className={`relative flex h-6 w-full cursor-pointer items-center gap-1 px-1.5 text-left text-[0.75rem] hover:outline hover:outline-ink ${
                        active ? 'outline-2 outline-accent' : ''
                      } ${off && !partner ? 'hatched' : ''} ${partner ? '' : 'text-faint'} ${
                        partner && !dmAsked && !teamAsked ? 'text-muted' : ''
                      }`}
                    >
                      {partner && <AskPair dm={dmAsked} team={teamAsked} />}
                      {partner ? <Name person={partner} display={names.get(partner.id)} variant="code" className="flex" /> : off ? null : <span>·</span>}
                      {(repeat || (off && partner)) && (
                        <span aria-label={repeat ? 'meets twice' : 'not available'} className="ml-auto pl-1 text-[0.65rem] font-bold text-warn">
                          {repeat ? '×2' : '!'}
                        </span>
                      )}
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

/** The selected cell: who is there, and everyone who could be, with what it would do. */
function Inspector({
  board,
  cell,
  onAssign,
  onAvailability,
  onClose,
}: {
  board: BoardData
  cell: Cell
  onAssign: (m: PlacedMeeting[]) => void
  onAvailability: (id: Id, slot: Id, available: boolean) => void
  onClose: () => void
}) {
  const { project, names, index, available } = board
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
  const list = (list: CandidateRow[]) => <CandidateList rows={list} board={board} onPick={assign} load={load} effectLine={effectLine} />

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-rule px-2 py-1.5">
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
        <div className="px-2 py-1.5">
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
          <div className="border-b border-rule px-2 py-1.5">
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

          <div className="px-2 py-1.5">
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

          <div className="border-t border-rule px-2 py-1">
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
  board,
  onPick,
  load,
  effectLine,
}: {
  rows: CandidateRow[]
  board: BoardData
  onPick: (id: Id) => void
  load: Map<Id, number>
  effectLine: (e: AssignEffect) => ReactNode
}) {
  const { project, names } = board
  if (!rows.length) return <p className="py-1 text-[0.8rem] text-muted">Nobody.</p>
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => (
        <li key={r.person.id}>
          <button
            type="button"
            onClick={() => onPick(r.person.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 py-1 text-left hover:bg-canvas"
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
