import { indexMeetings } from './scheduler'
import { participantName, slotLabel, type Project } from './state'

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** The board as shown: one row per slot, one column per decision maker. */
export function boardCsv(project: Project): string {
  const { byCell } = indexMeetings(project.meetings)
  const rows = [['Slot', ...project.dms.map((d) => d.name)]]
  for (let slot = 0; slot < project.slotCount; slot++) {
    rows.push([
      slotLabel(project, slot),
      ...project.dms.map((d) => {
        const m = byCell.get(`${slot}|${d.id}`)
        return m ? participantName(project, m.team) : ''
      }),
    ])
  }
  return csv(rows)
}

/** Everyone's running order in one long table, handy for mail-merge. */
export function personalCsv(project: Project): string {
  const { byCell, byTeamSlot } = indexMeetings(project.meetings)
  const rows = [['Who', 'Role', 'Slot', 'Meets']]
  for (const t of project.teams) {
    for (let slot = 0; slot < project.slotCount; slot++) {
      const m = byTeamSlot.get(`${slot}|${t.id}`)
      rows.push([t.name, 'Team', slotLabel(project, slot), m ? participantName(project, m.dm) : ''])
    }
  }
  for (const d of project.dms) {
    for (let slot = 0; slot < project.slotCount; slot++) {
      const m = byCell.get(`${slot}|${d.id}`)
      rows.push([d.name, 'Decision maker', slotLabel(project, slot), m ? participantName(project, m.team) : ''])
    }
  }
  return csv(rows)
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
