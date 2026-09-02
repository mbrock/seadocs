import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  assignCell,
  computeStats,
  findIssues,
  indexMeetings,
  pairKey,
  rankOf,
  scoreOf,
  SCORE_LABELS,
  type Id,
  type Issue,
  type MeetingIndex,
  type Participant,
  type PlacedMeeting,
  type Side,
  type Stats,
} from '../lib/scheduler'
import { participantName, slotLabel, withMeetings, type Project } from '../lib/project'
import { boardCsv, download } from '../lib/csv'
import { generate, isFresh, type Generated } from '../lib/generate'
import { Frontier } from './Frontier'
import { useNames } from './useNames'
import type { DisplayName } from '../lib/names'
import { Button, Empty, Figure, KeyItem, Name, OnlineMark, Panel, PanelHeader, ScorePair, Segmented, scoreTint, Swatch } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
  generated: Generated | null
  onGenerated: (g: Generated) => void
}

/** A board cell: one slot for one participant on the `side` shown across the top. */
interface Cell {
  slot: Id
  side: Side
  anchor: Id
}

export function BoardPanel({ project, onChange, generated, onGenerated }: Props) {
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const hasBoard = project.meetings.length > 0
  const [rows, setRows] = useState<Side>('dm')
  const [cell, setCell] = useState<Cell | null>(null)
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const names = useNames(project)
  const stats = useMemo(() => computeStats(project, project.meetings), [project])
  const issues = useMemo(() => findIssues(project.meetings), [project.meetings])
  const fresh = isFresh(generated, project)

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

  function run() {
    const g = generate(project)
    onGenerated(g)
    onChange(withMeetings(project, g.alternatives[0].meetings))
  }

  const setMeetings = (meetings: PlacedMeeting[]) => onChange((p) => withMeetings(p, meetings))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Panel>
          <PanelHeader title="Boards">
            <Button variant="primary" disabled={!hasPeople} onClick={run}>
              {hasBoard ? 'Generate again' : 'Generate'}
            </Button>
            <Button disabled={!hasBoard} onClick={() => download('meeting-board.csv', boardCsv(project), 'text/csv')}>
              CSV
            </Button>
          </PanelHeader>
          {fresh ? (
            <Frontier project={project} alternatives={generated.alternatives} onPick={setMeetings} />
          ) : hasBoard ? (
            <p className="px-3 py-3 text-[0.85rem] text-muted">
              {generated ? 'People, interest or slots changed since these boards were generated.' : 'This board was loaded from the saved project.'} Generate to
              see the alternatives.
            </p>
          ) : (
            <Empty>{hasPeople ? 'Generate to build the best boards from the interest grids.' : 'Add people and interest first.'}</Empty>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={`Board · ${project.meetings.length} meetings`}>
            <Key />
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
          </PanelHeader>
          {hasBoard ? (
            <Grid project={project} names={names} index={index} rows={rows} selected={selected} onSelect={setCell} />
          ) : (
            <Empty>No board yet.</Empty>
          )}
        </Panel>
      </div>

      <aside
        className={
          selected
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-auto rounded-t-[6px] border-t border-rule bg-paper shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:rounded-[4px] lg:border lg:shadow-none'
            : 'lg:sticky lg:top-14'
        }
      >
        {selected ? (
          <Inspector project={project} names={names} index={index} cell={selected} onAssign={setMeetings} onClose={() => setCell(null)} />
        ) : (
          <Summary project={project} names={names} stats={stats} issues={issues} hasBoard={hasBoard} />
        )}
      </aside>
    </div>
  )
}

/** Rows = one side (decision makers or teams), columns = slots. */
function Grid({
  project,
  names,
  index,
  rows,
  selected,
  onSelect,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
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
      {/* Fixed layout: the name column is 10.5rem, slots share the rest, and the table can't grow past the panel unless it has to. */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-[0.8rem]" style={{ minWidth: `${10.5 + 6 * project.slots.length}rem` }}>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 w-[10.5rem] border-r border-b border-rule bg-paper" />
            {project.slots.map((slot) => (
              <th key={slot.id} className="sticky top-0 z-20 border-r border-b border-rule bg-paper px-2 py-1.5 text-left font-mono text-[0.75rem] font-semibold">
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
                className="sticky left-0 z-10 border-r border-b border-rule bg-paper px-2 py-1 text-left text-[0.78rem] font-semibold whitespace-nowrap"
              >
                <Name person={person} display={names.get(person.id)} className="flex" />
              </th>
              {project.slots.map((slot) => {
                const m = meetingAt(slot.id, person.id)
                const partner = m ? partnerOf(m) : undefined
                const dmScore = m ? scoreOf(project.dmScores, m.team, m.dm) : 0
                const teamScore = m ? scoreOf(project.teamScores, m.team, m.dm) : 0
                const duplicate = m ? (index.byPair.get(pairKey(m.team, m.dm))?.length ?? 0) > 1 : false
                const active = selected?.slot === slot.id && selected.anchor === person.id
                return (
                  <td key={slot.id} className="border-r border-b border-rule/70 p-0">
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`${slotLabel(project, slot.id)}, ${person.name}: ${partner ? partner.name : 'free'}`}
                      title={partner ? `${partner.name} · decision maker ${dmScore}, team ${teamScore}` : 'free'}
                      onClick={() => onSelect({ slot: slot.id, side: rows, anchor: person.id })}
                      className={`relative flex h-8 w-full cursor-pointer items-center px-1.5 text-left text-[0.75rem] hover:outline hover:outline-ink ${
                        active ? 'outline-2 outline-accent' : ''
                      } ${duplicate ? 'bg-warn-soft text-warn' : scoreTint.dm[dmScore]} ${partner ? '' : 'text-faint'} ${
                        partner && !duplicate && dmScore === 0 && teamScore === 0 ? 'text-muted' : ''
                      }`}
                    >
                      {partner ? <Name person={partner} display={names.get(partner.id)} variant="code" className="flex" /> : <span>·</span>}
                      {duplicate && (
                        <span aria-label="meets twice" className="ml-auto pl-1 text-[0.65rem] font-bold">
                          ×2
                        </span>
                      )}
                      {teamScore > 0 && <span aria-hidden className="absolute right-1 bottom-1 h-1 w-1 rounded-full bg-sea-3" />}
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

/** What the cell colours mean. Tint = how much the decision maker asked; the dot = the team asked too. */
function Key() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <KeyItem
        swatch={
          <span className="inline-flex gap-px">
            <Swatch className="bg-rose-1" />
            <Swatch className="bg-rose-2" />
            <Swatch className="bg-rose-3" />
          </span>
        }
      >
        DM asked 1 · 2 · 3
      </KeyItem>
      <KeyItem swatch={<span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-sea-3" />}>team asked</KeyItem>
      <KeyItem swatch={<Swatch className="bg-paper" />}>
        <span className="text-muted">nobody asked</span>
      </KeyItem>
      <KeyItem swatch={<Swatch className="bg-warn-soft" />}>
        <span className="text-warn">×2 meets twice</span>
      </KeyItem>
    </div>
  )
}

/** The selected cell: who is there, and everyone who could be, with what it would cost. */
function Inspector({
  project,
  names,
  index,
  cell,
  onAssign,
  onClose,
}: {
  project: Project
  names: Map<Id, DisplayName>
  index: MeetingIndex
  cell: Cell
  onAssign: (m: PlacedMeeting[]) => void
  onClose: () => void
}) {
  const { slot, side, anchor } = cell
  const other: Side = side === 'dm' ? 'team' : 'dm'
  const anchorPerson = (side === 'dm' ? project.dms : project.teams).find((p) => p.id === anchor)!
  const candidates: Participant[] = other === 'team' ? project.teams : project.dms
  const meeting = side === 'dm' ? index.byCell.get(`${slot}|${anchor}`) : index.byTeamSlot.get(`${slot}|${anchor}`)
  const current = meeting ? meeting[other] : null
  const scoresFor = (partner: Id) => {
    const team = side === 'dm' ? partner : anchor
    const dm = side === 'dm' ? anchor : partner
    return { team, dm, dmScore: scoreOf(project.dmScores, team, dm), teamScore: scoreOf(project.teamScores, team, dm) }
  }
  const busyWith = (partner: Id) => {
    const m = other === 'team' ? index.byTeamSlot.get(`${slot}|${partner}`) : index.byCell.get(`${slot}|${partner}`)
    return m ? m[side] : null
  }
  const load = new Map<Id, number>()
  for (const m of project.meetings) load.set(m[other], (load.get(m[other]) ?? 0) + 1)

  const rows = candidates
    .filter((c) => c.id !== current)
    .map((c) => {
      const s = scoresFor(c.id)
      const met = index.byPair.get(pairKey(s.team, s.dm))
      const swapWith = busyWith(c.id)
      // A swap hands the current occupant to `swapWith`; warn if those two already meet elsewhere.
      const swapRepeats = swapWith !== null && current !== null && index.byPair.has(side === 'dm' ? pairKey(current, swapWith) : pairKey(swapWith, current))
      return { person: c, ...s, rank: s.dmScore * 4 + s.teamScore, alreadyAt: met?.[0]?.slot ?? null, swapWith, swapRepeats }
    })
    // Strongest request first; pairs that already meet sink to the bottom since they cannot be picked.
    .sort((a, b) => Number(a.alreadyAt !== null) - Number(b.alreadyAt !== null) || b.rank - a.rank || a.person.name.localeCompare(b.person.name))
  const requested = rows.filter((r) => r.rank > 0)
  const unrequested = rows.filter((r) => r.rank === 0)

  const assign = (partner: Id | null) => onAssign(assignCell(project.meetings, slot, side, anchor, partner))
  const cur = current ? scoresFor(current) : null

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-rule px-3 py-3">
        <div className="min-w-0">
          <div className="eyebrow">{slotLabel(project, slot)}</div>
          <div className="truncate text-[1rem] font-bold" title={anchorPerson.name}>
            {anchorPerson.name}
            <OnlineMark show={anchorPerson.online} />
          </div>
        </div>
        <Button variant="quiet" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      <div className="border-b border-rule px-3 py-3">
        {current && cur ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">Meets</div>
              <div className="truncate font-semibold">{participantName(project, current)}</div>
              <div className="text-[0.8rem] text-muted">
                decision maker {SCORE_LABELS[cur.dmScore]} · team {SCORE_LABELS[cur.teamScore]}
              </div>
            </div>
            <Button onClick={() => assign(null)}>Free</Button>
          </div>
        ) : (
          <div className="text-muted">Free slot</div>
        )}
      </div>

      <div className="px-3 py-3">
        <div className="eyebrow mb-1">{current ? 'Replace with' : 'Assign'}</div>
        <CandidateList rows={requested} project={project} names={names} onPick={assign} load={load} current={current} />
        {unrequested.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[0.8rem] text-muted">{unrequested.length} nobody asked for</summary>
            <CandidateList rows={unrequested} project={project} names={names} onPick={assign} load={load} current={current} />
          </details>
        )}
      </div>
    </div>
  )
}

interface CandidateRow {
  person: Participant
  dmScore: number
  teamScore: number
  alreadyAt: Id | null
  swapWith: Id | null
  swapRepeats: boolean
}

function CandidateList({
  rows,
  project,
  names,
  onPick,
  load,
  current,
}: {
  rows: CandidateRow[]
  project: Project
  names: Map<Id, DisplayName>
  onPick: (id: Id) => void
  load: Map<Id, number>
  /** Who sits in the cell now; a swap hands them to the candidate's current partner. */
  current: Id | null
}) {
  if (!rows.length) return <p className="py-1 text-[0.8rem] text-muted">Nobody.</p>
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => {
        const already = r.alreadyAt !== null
        return (
          <li key={r.person.id}>
            <button
              type="button"
              disabled={already}
              onClick={() => onPick(r.person.id)}
              title={
                already
                  ? `They already meet at ${slotLabel(project, r.alreadyAt!)} — a second meeting would be a repeat`
                  : r.swapWith
                    ? `Swap: ${participantName(project, r.swapWith)} gets the current occupant`
                    : 'Free in this slot'
              }
              className="flex w-full cursor-pointer items-center justify-between gap-2 py-1.5 text-left hover:bg-canvas disabled:cursor-default disabled:opacity-45"
            >
              <span className="min-w-0">
                <Name person={r.person} display={names.get(r.person.id)} className="flex text-[0.88rem] font-semibold" />
                <span className="block text-[0.75rem] text-muted">
                  {already
                    ? `already meet at ${slotLabel(project, r.alreadyAt!)}`
                    : r.swapWith
                      ? `swap with ${names.get(r.swapWith)?.code ?? participantName(project, r.swapWith)}`
                      : 'free'}
                  {!already && r.swapRepeats && current && (
                    <span className="text-warn">
                      {' '}
                      · {names.get(r.swapWith!)?.code} would meet {names.get(current)?.code} twice
                    </span>
                  )}{' '}
                  · {load.get(r.person.id) ?? 0}/{project.slots.length} booked
                </span>
              </span>
              <ScorePair dm={r.dmScore} team={r.teamScore} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Shown in the side panel when no cell is selected: how good the board is, what is missing. */
function Summary({
  project,
  names,
  stats,
  issues,
  hasBoard,
}: {
  project: Project
  names: Map<Id, DisplayName>
  stats: Stats
  issues: Issue[]
  hasBoard: boolean
}) {
  if (!hasBoard) return null
  const name = (id: Id) => names.get(id)?.code ?? participantName(project, id)
  const label = (slot: Id) => slotLabel(project, slot)
  return (
    <Panel>
      <PanelHeader title="This board" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-3 py-3">
        <Figure value={`${stats.meetings}/${stats.capacity}`} label="seats filled" />
        <Figure value={`${stats.mustMeetSatisfied}/${stats.mustMeetRequested}`} label="must-meets" tone={stats.mustMeetSatisfied < stats.mustMeetRequested ? 'warn' : 'ink'} />
        <Figure value={`${stats.dmSatisfied}/${stats.dmRequested}`} label="DM asks met" />
        <Figure value={`${stats.teamSatisfied}/${stats.teamRequested}`} label="team asks met" />
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
              </li>
            ))}
          </ul>
        </div>
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
