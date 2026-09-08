import { MAX_SLOTS, parseLines, parseRoster, withParticipants, withSlots, withTitle, type Project } from './project'

/** Bulk setup intentionally uses line position, including simultaneous renames. */
export function withDaySetup(project: Project, title: string, teams: string, dms: string, slots: string): Project {
  const labels = parseLines(slots)
  if (!labels.length || labels.length > MAX_SLOTS) throw new Error(`Enter 1–${MAX_SLOTS} time slots`)
  const next = withParticipants(project,
    parseRoster(teams).map((entry, i) => ({ ...entry, id: project.teams[i]?.id })),
    parseRoster(dms).map((entry, i) => ({ ...entry, id: project.dms[i]?.id })),
    true,
  )
  return withTitle(withSlots(next, labels), title)
}
