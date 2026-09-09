import { availabilityOfProject, participantName, slotLabel, type Project } from './project'
import { indexMeetings, meetingAt, otherSide, type Id, type Side } from './scheduler'
import { festivalProject, type Festival, type DayIndex } from './festival'

export function festivalSchedule(festival: Festival, day: DayIndex, side: Side, id: Id): string[] {
  const project = festivalProject(festival, day)
  return [`Festival meetings · Day ${day + 1}`, participantName(project, id),
    '', `Day ${day + 1}${project.title ? ` · ${project.title}` : ''}`, ...participantSchedule(project, side, id).slice(3),
  ]
}

export function participantSchedule(project: Project, side: Side, id: Id): string[] {
  const index = indexMeetings(project.meetings)
  const available = availabilityOfProject(project)
  return [project.title || 'Festival meetings', participantName(project, id), '',
    ...project.slots.map((slot) => {
      const meeting = meetingAt(index, side, slot.id, id)
      const partner = meeting && [...project.teams, ...project.dms].find((p) => p.id === meeting[otherSide(side)])
      return `${slotLabel(project, slot.id)} — ${partner ? `${partner.name}${partner.online ? ' (online)' : ''}` : available(id, slot.id) ? 'Free' : 'Not available'}`
    }),
  ]
}

/** Escape UTF-16 units using RTF's signed Unicode representation, not a lossy code page. */
function rtfEscape(text: string): string {
  return text.replace(/[\\{}\n\r\t]|[^\x20-\x7e]/g, (c) => {
    if ('\\{}'.includes(c)) return `\\${c}`
    if (c === '\n' || c === '\r') return '\\line '
    if (c === '\t') return '\\tab '
    const unit = c.charCodeAt(0)
    return `\\u${unit > 32767 ? unit - 65536 : unit}?`
  })
}

export function scheduleRtf(lines: string[]): string {
  return '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\uc1\\f0\\fs22\n' +
    lines.map((line, i) => `${i < 2 ? '\\b\\fs28 ' : '\\b0\\fs22 '}${rtfEscape(line)}\\par\n`).join('') + '}'
}
