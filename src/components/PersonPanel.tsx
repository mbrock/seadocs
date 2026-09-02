import { useMemo, useState } from 'react'
import { indexMeetings } from '../lib/scheduler'
import { participantName, slotLabel, type Project } from '../lib/state'
import { Button, Card, CardTitle, Hint } from './ui'

interface Props {
  project: Project
}

/** Selection is 't:<id>' or 'd:<id>'. */
export function PersonPanel({ project }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const options = [...project.teams.map((t) => 't:' + t.id), ...project.dms.map((d) => 'd:' + d.id)]
  const selection = picked && options.includes(picked) ? picked : (options[0] ?? null)

  return (
    <Card>
      <CardTitle>Personal boards</CardTitle>
      <Hint>Pick a team or decision maker to see their running order — this is what you'd print or send them.</Hint>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <select
          aria-label="Person"
          className="mt-2.5 border border-line bg-cream p-2 font-mono text-[13px]"
          value={selection ?? ''}
          onChange={(e) => setPicked(e.target.value)}
        >
          <optgroup label="Teams">
            {project.teams.map((t) => (
              <option key={t.id} value={'t:' + t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Decision makers">
            {project.dms.map((d) => (
              <option key={d.id} value={'d:' + d.id}>
                {d.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Button disabled={!selection || !project.meetings.length} onClick={() => window.print()}>
          Print this board
        </Button>
      </div>
      {selection === null ? (
        <Hint>Add participants first.</Hint>
      ) : project.meetings.length === 0 ? (
        <Hint>Generate a schedule first.</Hint>
      ) : (
        <PersonSchedule project={project} selection={selection} />
      )}
    </Card>
  )
}

function PersonSchedule({ project, selection }: { project: Project; selection: string }) {
  const index = useMemo(() => indexMeetings(project.meetings), [project.meetings])
  const isTeam = selection.startsWith('t:')
  const id = selection.slice(2)
  const slots = Array.from({ length: project.slotCount }, (_, i) => i)
  return (
    <div>
      <h3 className="mt-4.5 mb-1.5 font-mono text-[14px] tracking-[1px]">{participantName(project, id)}</h3>
      <ul>
        {slots.map((slot) => {
          const m = isTeam ? index.byTeamSlot.get(`${slot}|${id}`) : index.byCell.get(`${slot}|${id}`)
          return (
            <li key={slot} className="flex justify-between border-b border-line px-1 py-2.5 font-mono text-[13px]">
              <span className="text-teal">{slotLabel(project, slot)}</span>
              {m ? <span>{participantName(project, isTeam ? m.dm : m.team)}</span> : <span className="italic text-faint">free</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
