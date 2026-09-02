import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  assignCell,
  assignEffect,
  computeStats,
  findIssues,
  indexMeetings,
  isRefused,
  pairKey,
  rankOf,
  scoreOf,
  SCORE_LABELS,
  type AssignEffect,
  type Availability,
  type Id,
  type Issue,
  type MeetingIndex,
  type Pair,
  type Participant,
  type PlacedMeeting,
  type Side,
  type Stats,
} from '../lib/scheduler'
import { measure, requestedCounts, type Objectives, type ObjectiveKey } from '../lib/objectives'
import { availabilityOfProject, participantName, slotLabel, withAvailability, withMeetings, type Project } from '../lib/project'
import { boardCsv, download } from '../lib/csv'
import { optimize, type Alternative } from '../lib/optimize'
import { Frontier } from './Frontier'
import { useNames } from './useNames'
import type { DisplayName } from '../lib/names'
import { Button, Empty, Figure, KeyItem, Name, OnlineMark, Panel, PanelHeader, ScorePair, Segmented, scoreTint, Swatch } from './ui'

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
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const names = useNames(project)
  const { teams, dms, dmScores, teamScores, slots } = project
  const available = useMemo(() => availabilityOfProject({ teams, dms }), [teams, dms])
  const stats = useMemo(() => computeStats(project, project.meetings), [project])
  const issues = useMemo(() => findIssues(project.meetings, available), [project.meetings, available])
  // The boards the solver would build from the current input, recomputed only when the input (not the board) changes.
  const alternatives: Alternative[] = useMemo(
    () => (hasPeople ? optimize({ teams, dms, dmScores, teamScores, slots }) : []),
    [hasPeople, teams, dms, dmScores, teamScores, slots],
  )

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
  const recommended = alternatives[0]?.meetings ?? []

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]">
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
          {!hasBoard && (
            <Button variant="primary" disabled={!hasPeople || recommended.length === 0} onClick={() => setMeetings(recommended)}>
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
        {hasBoard && <Frontier project={project} alternatives={alternatives} onPick={setMeetings} />}
        {hasBoard ? (
          <Grid project={project} names={names} index={index} available={available} rows={rows} selected={selected} onSelect={setCell} />
        ) : (
          <Empty>
            {!hasPeople
              ? 'Add people and interest first.'
              : recommended.length === 0
                ? 'Nobody has asked for a meeting yet — fill in the interest grid.'
                : 'Generate builds the board from the interest grids.'}
          </Empty>
        )}
      </Panel>

      <aside
        className={
          selected
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-auto rounded-t-[6px] border-t border-rule bg-paper shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:rounded-[4px] lg:border lg:shadow-none'
            : 'lg:sticky lg:top-14'
        }
      >
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
          <Summary project={project} names={names} index={index} available={available} stats={stats} issues={issues} hasBoard={hasBoard} />
        )}
      </aside>
    </div>
  )
}

/** Three-step bar: how much the team asked for this meeting. */
function TeamBar({ score, className = '' }: { score: number; className?: string }) {
  if (!score) return null
  const height = ['', 'h-1/3', 'h-2/3', 'h-full'][score]
  return <span aria-hidden className={`w-[3px] bg-sea-3 ${height} ${className}`} />
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
                const dmScore = m ? scoreOf(project.dmScores, m.team, m.dm) : 0
                const teamScore = m ? scoreOf(project.teamScores, m.team, m.dm) : 0
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
                      title={partner ? `${partner.name} · decision maker ${SCORE_LABELS[dmScore]}, team ${SCORE_LABELS[teamScore]}` : state}
                      onClick={() => onSelect({ slot: slot.id, side: rows, anchor: person.id })}
                      className={`relative flex h-7 w-full cursor-pointer items-center px-1.5 text-left text-[0.75rem] hover:outline hover:outline-ink ${
                        active ? 'outline-2 outline-accent' : ''
                      } ${off && !partner ? 'hatched' : scoreTint.dm[dmScore]} ${partner ? '' : 'text-faint'} ${
                        partner && dmScore === 0 && teamScore === 0 ? 'text-muted' : ''
                      }`}
                    >
                      {partner ? <Name person={partner} display={names.get(partner.id)} variant="code" className="flex" /> : off ? null : <span>·</span>}
                      {(repeat || (off && partner)) && (
                        <span aria-label={repeat ? 'meets twice' : 'not available'} className="ml-auto pl-1 text-[0.65rem] font-bold text-warn">
                          {repeat ? '×2' : '!'}
                        </span>
                      )}
                      <TeamBar score={teamScore} className="absolute right-0 bottom-0" />
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

/** What the cell colours mean: tint = how much the decision maker asked; the bar at the right edge = how much the team asked. */
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <KeyItem
        swatch={
          <span className="inline-flex gap-px">
            <Swatch className="bg-gold-1" />
            <Swatch className="bg-gold-2" />
            <Swatch className="bg-gold-3" />
          </span>
        }
      >
        DM asked 1 · 2 · 3
      </KeyItem>
      <KeyItem
        swatch={
          <span className="inline-flex h-3 items-end gap-[3px]">
            <TeamBar score={1} />
            <TeamBar score={2} />
            <TeamBar score={3} />
          </span>
        }
      >
        team asked 1 · 2 · 3
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
  const scoresFor = (team: Id, dm: Id) => ({ dm: scoreOf(project.dmScores, team, dm), team: scoreOf(project.teamScores, team, dm) })
  const pairWith = (partner: Id) => (side === 'dm' ? { team: partner, dm: anchor } : { team: anchor, dm: partner })
  const load = new Map<Id, number>()
  for (const m of project.meetings) load.set(m[other], (load.get(m[other]) ?? 0) + 1)

  const all: CandidateRow[] = candidates
    .filter((c) => c.id !== current)
    .map((c) => {
      const p = pairWith(c.id)
      const s = scoresFor(p.team, p.dm)
      return { person: c, dmScore: s.dm, teamScore: s.team, rank: s.dm * 4 + s.team, effect: assignEffect(project.meetings, slot, side, anchor, c.id, available) }
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
  const cur = current ? scoresFor(pairWith(current).team, pairWith(current).dm) : null
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
            swap · {code(e.displaced)} gets {code(e.second[other])} <ScorePair {...scoresFor(e.second.team, e.second.dm)} />
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
                  <div className="text-[0.8rem] text-muted">
                    decision maker {SCORE_LABELS[cur.dm]} · team {SCORE_LABELS[cur.team]}
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
  dmScore: number
  teamScore: number
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
            <ScorePair dm={r.dmScore} team={r.teamScore} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Shown in the side panel when no cell is selected: how good the board is, what is missing. */
function Summary({
  project,
  names,
  index,
  available,
  stats,
  issues,
  hasBoard,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  available: Availability
  stats: Stats
  issues: Issue[]
  hasBoard: boolean
}) {
  const objectives: Objectives = useMemo(() => measure(project, project.meetings), [project])
  const asked = useMemo(() => requestedCounts(project), [project])
  if (!hasBoard) return null
  const name = (id: Id) => names.get(id)?.code ?? participantName(project, id)
  const label = (slot: Id) => slotLabel(project, slot)
  const met = (key: ObjectiveKey) => `${(asked[key] ?? 0) - objectives[key]}/${asked[key] ?? 0}`

  // Per decision maker: meetings they asked for vs got, worst share first.
  const perDm = project.dms
    .map((dm) => {
      const wanted = project.teams.filter((t) => scoreOf(project.dmScores, t.id, dm.id) > 0).length
      const got = project.teams.filter((t) => scoreOf(project.dmScores, t.id, dm.id) > 0 && index.byPair.has(pairKey(t.id, dm.id))).length
      return { dm, wanted, got, share: wanted ? got / wanted : 1 }
    })
    .filter((r) => r.wanted > 0)
    .sort((a, b) => a.share - b.share || b.wanted - a.wanted)

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
      <PanelHeader title="This board" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-3 py-3">
        <Figure value={`${stats.meetings}/${stats.capacity}`} label="meetings possible" />
        <Figure value={met('missedMust')} label="must-meets" tone={objectives.missedMust > 0 ? 'warn' : 'ink'} />
        <Figure value={met('missedPriority')} label="priorities" />
        <Figure value={met('missedInterested')} label="interested" />
        <Figure value={met('missedTeam')} label="team asks" />
        <Figure value={objectives.dmGaps} label="DM windows" tone={objectives.dmGaps ? 'ink' : 'muted'} />
        <Figure value={objectives.dmsUnderHalf} label="DMs under half" tone={objectives.dmsUnderHalf ? 'warn' : 'muted'} />
        <Figure value={objectives.teamsEmpty} label="teams left out" tone={objectives.teamsEmpty ? 'warn' : 'muted'} />
        {objectives.fillers > 0 && <Figure value={objectives.fillers} label="nobody asked" tone="muted" />}
      </div>
      {issues.length > 0 && (
        <div className="border-t border-rule px-3 py-3">
          <div className="eyebrow mb-1 text-warn">Problems · {issues.length}</div>
          <ul className="text-[0.8rem]">
            {issues.map((i, idx) => (
              <li key={idx} className="py-0.5">
                {i.type === 'duplicate' && `${name(i.dm)} meets ${name(i.team)} twice · ${i.slots.map(label).join(', ')}`}
                {i.type === 'team-clash' && `${name(i.team)} is in two places at ${label(i.slot)}`}
                {i.type === 'dm-clash' && `${name(i.dm)} is in two places at ${label(i.slot)}`}
                {i.type === 'unavailable' && `${name(i.who)} is booked at ${label(i.slot)} but not available then`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[0.75rem] text-muted">Click the cell to fix it. Export is off until the board is clean.</p>
        </div>
      )}
      {perDm.length > 0 && (
        <details className="border-t border-rule px-3 py-3" open={objectives.dmsUnderHalf > 0}>
          <summary className="eyebrow cursor-pointer">Per decision maker · got / asked</summary>
          <ul className="mt-1 max-h-[30vh] overflow-auto text-[0.8rem]">
            {perDm.map((r) => (
              <li key={r.dm.id} className="flex items-center justify-between gap-2 py-0.5">
                <Name person={r.dm} display={names.get(r.dm.id)} className="flex min-w-0" />
                <span className={`shrink-0 tabular-nums ${r.share < 0.5 ? 'font-semibold text-warn' : r.share < 1 ? '' : 'text-muted'}`}>
                  {r.got}/{r.wanted}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="border-t border-rule px-3 py-3">
        <div className="eyebrow mb-1">Not scheduled · {stats.unmet.length}</div>
        {stats.unmet.length === 0 ? (
          <p className="text-[0.8rem] text-muted">Every request got a meeting.</p>
        ) : (
          <ul className="max-h-[40vh] overflow-auto text-[0.8rem]">
            {stats.unmet.map((p) => (
              <li key={pairKey(p.team, p.dm)} className="flex items-center justify-between gap-2 py-0.5" title={`rank ${rankOf(p)}`}>
                <span className="min-w-0 truncate">
                  {p.dmScore > 0 ? (
                    <>
                      {name(p.dm)} <span className="text-muted">→</span> {name(p.team)}
                    </>
                  ) : (
                    <>
                      {name(p.team)} <span className="text-muted">→</span> {name(p.dm)}
                    </>
                  )}
                  <span className="ml-1.5 text-[0.7rem] text-muted">{why(p)}</span>
                </span>
                <ScorePair dm={p.dmScore} team={p.teamScore} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
