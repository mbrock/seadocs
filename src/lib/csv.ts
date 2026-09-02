import { indexMeetings } from './scheduler'
import { participantName, slotLabel, type Project } from './project'

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** The board as shown: one row per slot, one column per decision maker. */
export function boardCsv(project: Project): string {
  const { byCell } = indexMeetings(project.meetings)
  const rows = [['Slot', ...project.dms.map((d) => d.name)]]
  for (const slot of project.slots) {
    rows.push([
      slotLabel(project, slot.id),
      ...project.dms.map((d) => {
        const m = byCell.get(`${slot.id}|${d.id}`)
        return m ? participantName(project, m.team) : ''
      }),
    ])
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
