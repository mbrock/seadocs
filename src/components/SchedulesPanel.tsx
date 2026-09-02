import { useMemo, useState } from 'react'
import { findIssues, indexMeetings, type Availability, type Id, type MeetingIndex, type Participant, type Side } from '../lib/scheduler'
import { availabilityOfProject, participantName, slotLabel, tableLabel, type Project } from '../lib/project'
import { download, personalCsv } from '../lib/csv'
import { Button, Chooser, Empty, OnlineMark, Panel, PanelHeader } from './ui'
import { useNames } from './useNames'

interface Props {
  project: Project
}

/** One running order per person, laid out to print. */
export function SchedulesPanel({ project }: Props) {
  const hasBoard = project.meetings.length > 0
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const available = useMemo(() => availabilityOfProject(project), [project])
  const problems = useMemo(() => findIssues(project.meetings, available).length, [project.meetings, available])
  const blocked = problems > 0 ? `Fix the ${problems === 1 ? 'problem' : `${problems} problems`} on the board first` : undefined
  const [chosen, setChosen] = useState<Id | null>(null)
  const [printAll, setPrintAll] = useState(false)
  const names = useNames(project)
  const countFor = (id: Id) => project.meetings.filter((m) => m.team === id || m.dm === id).length

  const people: { person: Participant; side: Side }[] = [
    ...project.teams.map((person) => ({ person, side: 'team' as const })),
    ...project.dms.map((person) => ({ person, side: 'dm' as const })),
  ]
  const current = people.find((p) => p.person.id === chosen) ?? people[0] ?? null

  if (!hasBoard) return <Empty>Generate a board first.</Empty>

  function printEveryone() {
    setPrintAll(true)
    // Give React a frame to render every sheet before the print dialog snapshots the page.
    requestAnimationFrame(() => {
      window.print()
      setPrintAll(false)
    })
  }

  return (
    <>
      <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] ${printAll ? 'print:hidden' : ''}`}>
        <Panel className="lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-auto print:hidden">
          <PanelHeader title="Who">
            <Button onClick={printEveryone} disabled={!!blocked} title={blocked}>
              Print all
            </Button>
            <Button onClick={() => download('running-orders.csv', personalCsv(project), 'text/csv')} disabled={!!blocked} title={blocked}>
              CSV
            </Button>
          </PanelHeader>
          <Chooser
            label="Person"
            groups={[
              { title: 'Teams', people: project.teams },
              { title: 'Decision makers', people: project.dms },
            ]}
            current={current?.person.id ?? null}
            onPick={setChosen}
            names={names}
            meta={(p) => countFor(p.id)}
          />
        </Panel>

        {current && (
          <Panel className="print:border-0">
            <PanelHeader title="Running order" className="print:hidden">
              <Button onClick={() => window.print()} disabled={!!blocked} title={blocked}>
                Print
              </Button>
            </PanelHeader>
            <RunningOrder project={project} index={index} person={current.person} side={current.side} available={available} />
          </Panel>
        )}
      </div>

      {printAll && (
        <div className="hidden print:block">
          {people.map(({ person, side }) => (
            <div key={person.id} className="print-page">
              <RunningOrder project={project} index={index} person={person} side={side} available={available} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** A single person's day: every slot, who they meet or a blank. */
function RunningOrder({
  project,
  index,
  person,
  side,
  available,
}: {
  project: Project
  index: MeetingIndex
  person: Participant
  side: Side
  available: Availability
}) {
  const other: Side = side === 'team' ? 'dm' : 'team'
  const meetingAt = (slot: Id) => (side === 'dm' ? index.byCell.get(`${slot}|${person.id}`) : index.byTeamSlot.get(`${slot}|${person.id}`))
  const meetings = project.slots.filter((s) => meetingAt(s.id)).length
  const where = side === 'dm' ? tableLabel(project, person.id) : ''
  return (
    <article className="px-3 py-3 print:px-0">
      <div className="mb-4 border-b-2 border-ink pb-2">
        <div className="eyebrow">{project.title || 'One-to-one meetings'}</div>
        <h3 className="text-[1.4rem] leading-tight font-extrabold tracking-[-0.03em]">
          {person.name}
          <OnlineMark show={person.online} />
        </h3>
        <div className="mt-1 text-[0.85rem] text-muted">
          {side === 'team' ? 'Project team' : 'Decision maker'} · {meetings} {meetings === 1 ? 'meeting' : 'meetings'} in {project.slots.length} slots
          {side === 'dm' && where && ` · ${where === 'online' ? 'joins online' : where}`}
          {side === 'team' && person.online && ' · joins online'}
        </div>
      </div>
      <table className="w-full border-collapse text-[0.95rem]">
        <tbody>
          {project.slots.map((slot) => {
            const m = meetingAt(slot.id)
            const partnerId = m ? m[other] : null
            const partner = partnerId ? (other === 'dm' ? project.dms : project.teams).find((p) => p.id === partnerId) : null
            return (
              <tr key={slot.id} className="border-b border-rule">
                <th scope="row" className="w-[6rem] py-2 pr-4 text-left font-mono text-[0.85rem] font-semibold whitespace-nowrap">
                  {slotLabel(project, slot.id)}
                </th>
                <td className={`py-2 ${m ? 'font-semibold' : 'text-faint'}`}>
                  {partnerId ? (
                    <>
                      {participantName(project, partnerId)}
                      <OnlineMark show={partner?.online} />
                    </>
                  ) : available(person.id, slot.id) ? (
                    '—'
                  ) : (
                    <span className="text-[0.85rem] text-muted italic">not available</span>
                  )}
                </td>
                {side === 'team' && (
                  <td className="w-[6rem] py-2 text-right text-[0.85rem] text-muted whitespace-nowrap">{partnerId ? tableLabel(project, partnerId) : ''}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[0.75rem] text-muted">
        <PrintedAt />
      </div>
    </article>
  )
}

/** "printed 14:05" — so a reprinted sheet can be told from an older one. */
function PrintedAt() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return <>printed {hh}:{mm}</>
}
