import { useMemo, type Dispatch, type SetStateAction } from 'react'
import {
  buildSchedule,
  computeStats,
  findIssues,
  indexMeetings,
  pairKey,
  reassign,
  scoreOf,
  SCORE_LABELS,
  type Issue,
  type MeetingIndex,
  type Participant,
  type Stats,
} from '../lib/scheduler'
import { participantName, slotLabel, withMeetings, type Project } from '../lib/state'
import { boardCsv, download, personalCsv } from '../lib/csv'
import { Button, Card, CardTitle, Hint } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

export function SchedulePanel({ project, onChange }: Props) {
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const hasBoard = project.meetings.length > 0
  const stats = useMemo(() => computeStats(project, project.meetings), [project])
  const issues = useMemo(() => findIssues(project.meetings), [project.meetings])

  return (
    <>
      <Card>
        <CardTitle>Generate</CardTitle>
        <Hint>
          Chooses which meetings happen (highest decision-maker interest first, then team interest, spreading equal interest evenly
          across teams), then fits every chosen meeting into the slots. Generating again replaces any manual changes.
        </Hint>
        <label className="mb-1 block text-[13px] italic text-muted">
          <input
            type="checkbox"
            className="mr-1.5 accent-teal"
            checked={project.fillGaps}
            onChange={(e) => onChange((p) => ({ ...p, fillGaps: e.target.checked }))}
          />
          Fill leftover gaps with pairings nobody asked for (off = leave those slots free)
        </label>
        <div>
          <Button
            variant="action"
            disabled={!hasPeople}
            onClick={() => onChange(withMeetings(project, buildSchedule(project, { fillGaps: project.fillGaps })))}
          >
            Generate schedule
          </Button>
          <Button disabled={!hasBoard} onClick={() => download('meeting-board.csv', boardCsv(project), 'text/csv')}>
            Export board CSV
          </Button>
          <Button disabled={!hasBoard} onClick={() => download('meeting-board-personal.csv', personalCsv(project), 'text/csv')}>
            Export personal schedules CSV
          </Button>
        </div>
        {hasBoard && (
          <>
            <StatsRow stats={stats} />
            <Unmet project={project} stats={stats} />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Board</CardTitle>
        <Hint>
          Columns = decision makers, rows = slots. Scroll sideways for the rest. Change any cell to reassign it — picking a team
          that's already booked in that slot swaps the two meetings. Cell colour shows how keen the decision maker was.
        </Hint>
        <Issues project={project} issues={issues} />
        {hasBoard ? (
          <div className="max-h-[600px] overflow-auto border border-line">
            <Board
              project={project}
              onReassign={(slot, dm, team) => onChange((p) => withMeetings(p, reassign(p.meetings, slot, dm, team)))}
            />
          </div>
        ) : (
          <Hint>{hasPeople ? 'Nothing generated yet.' : 'Add participants in Setup first.'}</Hint>
        )}
      </Card>
    </>
  )
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0)

function StatsRow({ stats }: { stats: Stats }) {
  const items: [string, string][] = [
    [String(stats.meetings), 'meetings placed'],
    [`${stats.dmSatisfied}/${stats.dmRequested}`, `DM interest met (${pct(stats.dmSatisfied, stats.dmRequested)}%)`],
    [`${stats.mustMeetSatisfied}/${stats.mustMeetRequested}`, 'DM must-meets scheduled'],
    [`${stats.teamSatisfied}/${stats.teamRequested}`, `team interest met (${pct(stats.teamSatisfied, stats.teamRequested)}%)`],
    [String(stats.teamOnlyHonoured), 'team-only requests honoured'],
    [String(stats.teamsWithoutMeetings), 'teams with no meetings'],
    [`${pct(stats.meetings, stats.capacity)}%`, 'board capacity used'],
  ]
  return (
    <div className="my-4 flex flex-wrap gap-6">
      {items.map(([num, lbl]) => (
        <div key={lbl} className="border-l-[3px] border-amber px-3 py-0.5 font-mono">
          <span className="block text-[22px] font-bold">{num}</span>
          <span className="text-[10px] uppercase tracking-[1px] text-teal">{lbl}</span>
        </div>
      ))}
    </div>
  )
}

function Unmet({ project, stats }: { project: Project; stats: Stats }) {
  if (!stats.unmet.length) return <Hint>Every requested meeting was scheduled.</Hint>
  const n = stats.unmet.length
  return (
    <details>
      <summary className="cursor-pointer font-mono text-[12px] text-teal">
        {n} requested meeting{n === 1 ? '' : 's'} did not fit — show
      </summary>
      <ul className="mt-2 columns-2 pl-4.5 text-[13px]">
        {stats.unmet.map((p) => {
          const dm = participantName(project, p.dm)
          const team = participantName(project, p.team)
          const who = p.dmScore > 0 ? `${dm} → ${team}` : `${team} → ${dm}`
          const why =
            p.dmScore > 0
              ? `DM: ${SCORE_LABELS[p.dmScore]}${p.teamScore ? `, team: ${SCORE_LABELS[p.teamScore]}` : ''}`
              : `team only: ${SCORE_LABELS[p.teamScore]}`
          return (
            <li key={pairKey(p.team, p.dm)} className="mb-0.5 list-disc">
              {who} <small className="text-muted">({why})</small>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function Issues({ project, issues }: { project: Project; issues: Issue[] }) {
  if (!issues.length) return null
  const name = (id: string) => participantName(project, id)
  const label = (slot: number) => slotLabel(project, slot)
  return (
    <div className="mb-3 border-l-[3px] border-brick px-3 py-1.5 text-[13px]">
      <strong>Check these:</strong>
      <ul className="mt-1 list-disc pl-4.5">
        {issues.map((i, idx) => (
          <li key={idx}>
            {i.type === 'duplicate' && `${name(i.team)} and ${name(i.dm)} meet twice (${label(i.slots[0])} and ${label(i.slots[1])}).`}
            {i.type === 'team-clash' && `${name(i.team)} is booked twice in ${label(i.slot)}.`}
            {i.type === 'dm-clash' && `${name(i.dm)} is booked twice in ${label(i.slot)}.`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Board({ project, onReassign }: { project: Project; onReassign: (slot: number, dm: string, team: string | null) => void }) {
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const slots = Array.from({ length: project.slotCount }, (_, i) => i)
  const th = 'sticky top-0 z-20 min-w-[150px] bg-ink px-1.5 py-2 font-mono text-[10px] tracking-[0.5px] text-paper'
  return (
    <table className="border-collapse text-[12px]">
      <thead>
        <tr>
          <th className={`${th} left-0 z-30 min-w-0`}>Slot</th>
          {project.dms.map((d) => (
            <th key={d.id} className={th}>
              {d.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {slots.map((slot) => (
          <tr key={slot}>
            <td className="sticky left-0 z-10 border border-line bg-paper-dim px-1.5 py-1 font-mono font-bold whitespace-nowrap">
              {slotLabel(project, slot)}
            </td>
            {project.dms.map((d) => (
              <td key={d.id} className="min-w-[150px] border border-line bg-cream px-1.5 py-1">
                <CellSelect project={project} slot={slot} dm={d} index={index} onReassign={onReassign} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const dmTint = ['', 'bg-amber-pale', 'bg-amber-dim', 'bg-amber']

function CellSelect({
  project,
  slot,
  dm,
  index,
  onReassign,
}: {
  project: Project
  slot: number
  dm: Participant
  index: MeetingIndex
  onReassign: (slot: number, dm: string, team: string | null) => void
}) {
  const current = index.byCell.get(`${slot}|${dm.id}`)?.team ?? null
  const duplicate = current !== null && (index.byPair.get(pairKey(current, dm.id))?.length ?? 0) > 1
  const tint = current !== null ? dmTint[scoreOf(project.dmScores, current, dm.id)] : ''
  const style =
    current === null
      ? 'border-line bg-cream italic text-faint'
      : `font-semibold text-ink ${duplicate ? 'border-2 border-brick' : 'border-teal'} ${tint || 'bg-cream'}`
  return (
    <span className="relative block">
      <select
        aria-label={`${slotLabel(project, slot)}, ${dm.name}`}
        value={current ?? ''}
        onChange={(e) => onReassign(slot, dm.id, e.target.value === '' ? null : e.target.value)}
        className={`w-full cursor-pointer appearance-none rounded-sm border py-[7px] pr-[22px] pl-2 font-mono text-[12px] hover:brightness-95 ${style}`}
      >
        <option value="">— free —</option>
        {project.teams.map((t) => {
          const busy = index.byTeamSlot.get(`${slot}|${t.id}`)
          let label = t.name
          if (busy && t.id !== current) label += ` ⇄ swap (now with ${participantName(project, busy.dm)})`
          else if (t.id !== current && index.byPair.has(pairKey(t.id, dm.id))) label += ' (already meeting)'
          return (
            <option key={t.id} value={t.id}>
              {label}
            </option>
          )
        })}
      </select>
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[8px] text-teal">
        ▼
      </span>
    </span>
  )
}
