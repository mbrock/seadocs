import { useMemo, useState } from 'react'
import { indexMeetings, type Id, type MeetingIndex, type Participant, type Side } from '../lib/scheduler'
import { participantName, slotLabel, type Project } from '../lib/project'
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
      <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] ${printAll ? 'print:hidden' : ''}`}>
        <Panel className="lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-auto print:hidden">
          <PanelHeader title="Who">
            <Button onClick={printEveryone}>Print all</Button>
            <Button onClick={() => download('running-orders.csv', personalCsv(project), 'text/csv')}>CSV</Button>
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
              <Button onClick={() => window.print()}>Print</Button>
            </PanelHeader>
            <RunningOrder project={project} index={index} person={current.person} side={current.side} />
          </Panel>
        )}
      </div>

      {printAll && (
        <div className="hidden print:block">
          {people.map(({ person, side }) => (
            <div key={person.id} className="print-page">
              <RunningOrder project={project} index={index} person={person} side={side} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** A single person's day: every slot, who they meet or a blank. */
function RunningOrder({ project, index, person, side }: { project: Project; index: MeetingIndex; person: Participant; side: Side }) {
  const other: Side = side === 'team' ? 'dm' : 'team'
  const meetingAt = (slot: Id) => (side === 'dm' ? index.byCell.get(`${slot}|${person.id}`) : index.byTeamSlot.get(`${slot}|${person.id}`))
  const meetings = project.slots.filter((s) => meetingAt(s.id)).length
  return (
    <article className="px-4 py-4 print:px-0">
      <div className="mb-4 border-b-2 border-ink pb-2">
        <div className="eyebrow">{side === 'team' ? 'Project team' : 'Decision maker'} · one-to-one meetings</div>
        <h3 className="text-[1.4rem] leading-tight font-extrabold tracking-[-0.03em]">
          {person.name}
          <OnlineMark show={person.online} />
        </h3>
        <div className="mt-1 text-[0.85rem] text-muted">
          {meetings} {meetings === 1 ? 'meeting' : 'meetings'} · {project.slots.length} slots
          {person.online && ' · joins online'}
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
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </article>
  )
}
