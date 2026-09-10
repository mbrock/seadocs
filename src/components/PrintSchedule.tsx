import type { DayIndex } from '../lib/festival'
import { availabilityOfProject, slotLabel, type Project } from '../lib/project'
import { findIssues, indexMeetings, meetingAt } from '../lib/scheduler'

/** A paginated running order, rather than a squeezed screenshot of the editor. */
export function PrintSchedule({ project, day, compact = false }: { project: Project; day: DayIndex; compact?: boolean }) {
  const index = indexMeetings(project.meetings)
  const available = availabilityOfProject(project)
  const teams = new Map(project.teams.map((team) => [team.id, team]))
  const issues = findIssues(project.meetings, available).length
  if (compact) {
    // Bound column widths; browsers paginate rows but do not split wide tables.
    const groups = Array.from({ length: Math.ceil(project.slots.length / 12) }, (_, i) => project.slots.slice(i * 12, (i + 1) * 12))
    return <article className="print-schedule print-compact hidden print:block">
      {groups.map((slots, i) => <section className="print-slot" key={i}>
        <table>
          <colgroup><col style={{ width: '34mm' }} />{slots.map((slot) => <col key={slot.id} />)}</colgroup>
          <thead>
            <tr><th colSpan={slots.length + 1} className="print-title">
              <h1>Day {day + 1} · {project.title || 'Festival meetings'}</h1>
              <p>Compact schedule · {project.meetings.length} meetings · — free · × unavailable · (online) remote participant{groups.length > 1 ? ` · Time block ${i + 1}/${groups.length}` : ''}</p>
              {issues > 0 && <p>WARNING: {issues} schedule problems. Resolve before distributing.</p>}
            </th></tr>
            <tr><th scope="col">Decision maker</th>{slots.map((slot) => <th scope="col" key={slot.id}>{slotLabel(project, slot.id)}</th>)}</tr>
          </thead>
          <tbody>{project.dms.map((dm) => <tr key={dm.id}>
            <th scope="row">{dm.name}{dm.online ? ' (online)' : ''}</th>
            {slots.map((slot) => {
              const meeting = meetingAt(index, 'dm', slot.id, dm.id)
              const team = meeting && teams.get(meeting.team)
              return <td key={slot.id}>{team ? `${team.name}${team.online ? ' (online)' : ''}` : available(dm.id, slot.id) ? '—' : '×'}</td>
            })}
          </tr>)}</tbody>
        </table>
      </section>)}
    </article>
  }
  return <article className="print-schedule hidden print:block">
    {project.slots.map((slot) => <section className="print-slot" key={slot.id}>
      <table>
        <thead>
          <tr><th colSpan={2} className="print-title">
            <div>Day {day + 1} · Organizer running order</div>
            <h1>{project.title || 'Festival meetings'}</h1>
            <h2>{slotLabel(project, slot.id)}</h2>
            <p>{project.meetings.filter((m) => m.slot === slot.id).length} meetings · {project.dms.length} decision makers</p>
            {issues > 0 && <p>WARNING: {issues} schedule problems. Resolve conflicts before distributing.</p>}
            {!project.meetings.length && <p>No meetings scheduled.</p>}
          </th></tr>
          <tr><th scope="col">Decision maker</th><th scope="col">Film / project</th></tr>
        </thead>
        <tbody>{project.dms.map((dm) => {
          const meeting = meetingAt(index, 'dm', slot.id, dm.id)
          const team = meeting && teams.get(meeting.team)
          return <tr key={dm.id}>
            <th scope="row">{dm.name}{dm.online ? ' (online)' : ''}</th>
            <td>{team ? <>{team.name}{team.online ? ' (online)' : ''}</> : available(dm.id, slot.id) ? '— Free' : '— Unavailable'}</td>
          </tr>
        })}</tbody>
      </table>
      <p className="print-note">Day {day + 1} · {slotLabel(project, slot.id)} · Current schedule at time of printing. Each pair is one meeting.</p>
    </section>)}
  </article>
}
