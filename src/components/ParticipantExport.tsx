import { useState } from 'react'
import { download } from '../lib/csv'
import { availabilityOfProject, type Project } from '../lib/project'
import { findIssues } from '../lib/scheduler'
import { festivalSchedule, scheduleRtf } from '../lib/participantExport'
import { type Festival, type DayIndex } from '../lib/festival'
import { Button } from './ui'

export function ParticipantExport({ project, festival, day }: { project: Project; festival: Festival; day: DayIndex }) {
  const [id, setId] = useState('')
  const [note, setNote] = useState('')
  const person = [...project.dms, ...project.teams].find((p) => p.id === id)
  const side = project.dms.some((p) => p.id === id) ? 'dm' : 'team'
  const lines = person ? festivalSchedule(festival, day, side, id) : []
  const text = lines.join('\n')
  const issues = findIssues(project.meetings, availabilityOfProject(project)).length
  const filename = `schedule-day-${day + 1}-${person?.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'participant'}`
  return (
    <section className="mt-6 rounded border border-rule p-3">
      <h2 className="font-bold">Share an individual schedule · Day {day + 1}</h2>
      <p className="mb-3 text-muted">Exports include Day {day + 1} only, for decision makers and film teams. Switch festival days above to export the other day when it is ready. Free and unavailable times are included.</p>
      <label className="block">Decision maker or film team
        <select className="mt-1 max-w-full rounded border border-rule bg-paper p-2" value={person ? id : ''} onChange={(e) => { setId(e.target.value); setNote('') }}>
          <option value="">Choose a participant…</option>
          <optgroup label="Decision makers">{project.dms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          <optgroup label="Film teams">{project.teams.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>
      </label>
      {person && <>
        <textarea aria-label="Individual schedule preview" readOnly value={text} rows={Math.min(lines.length, 14)} className="my-3 block w-full rounded border border-rule bg-canvas p-3" />
        <div className="flex flex-wrap gap-2">
          <Button disabled={issues > 0} onClick={async () => {
            try { await navigator.clipboard.writeText(text); setNote('Copied schedule') }
            catch { setNote('Clipboard unavailable. Select and copy the preview, or download the text.') }
          }}>Copy text</Button>
          <Button disabled={issues > 0} onClick={() => download(`${filename}.txt`, text, 'text/plain;charset=utf-8')}>Download text</Button>
          <Button disabled={issues > 0} onClick={() => download(`${filename}.rtf`, scheduleRtf(lines), 'application/rtf')}>Download document (.rtf)</Button>
        </div>
        <p className="mt-2 text-muted">RTF opens in Word and can be imported into Google Docs.</p>
      </>}
      {issues > 0 && <p role="alert" className="text-warn">Fix board problems before exporting.</p>}
      <p role="status" className="text-muted">{note}</p>
    </section>
  )
}
