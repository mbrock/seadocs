import { indexMeetings, scoreOf } from './scheduler'
import { participantName, slotLabel, tableLabel, type Project, type ScoreKind } from './project'

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

/**
 * One side's asks as a grid: rows = decision makers, columns = teams, cells
 * 0–3 (blank for 0). Fill it in a spreadsheet and paste it back into Interest.
 */
export function interestCsv(project: Project, kind: ScoreKind): string {
  const scores = kind === 'dm' ? project.dmScores : project.teamScores
  const rows = [[kind === 'dm' ? 'Decision maker asks (0–3)' : 'Team asks (0–3)', ...project.teams.map((t) => t.name)]]
  for (const d of project.dms) {
    rows.push([d.name, ...project.teams.map((t) => String(scoreOf(scores, t.id, d.id) || ''))])
  }
  return csv(rows)
}

/** Everyone's running order in one long table, handy for mail-merge. */
export function personalCsv(project: Project): string {
  const { byCell, byTeamSlot } = indexMeetings(project.meetings)
  const rows = [['Who', 'Role', 'Slot', 'Meets', 'Where']]
  for (const t of project.teams) {
    for (const slot of project.slots) {
      const m = byTeamSlot.get(`${slot.id}|${t.id}`)
      rows.push([t.name, 'Team', slotLabel(project, slot.id), m ? participantName(project, m.dm) : '', m ? tableLabel(project, m.dm) : ''])
    }
  }
  for (const d of project.dms) {
    for (const slot of project.slots) {
      const m = byCell.get(`${slot.id}|${d.id}`)
      rows.push([d.name, 'Decision maker', slotLabel(project, slot.id), m ? participantName(project, m.team) : '', tableLabel(project, d.id)])
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
