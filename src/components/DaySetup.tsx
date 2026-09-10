import { useState } from 'react'
import { delayTimes, MAX_SLOTS, parseLines, rosterText, slotLabel, type Project } from '../lib/project'
import { withDaySetup } from '../lib/setup'
import { quarterHourSlots, type DayIndex } from '../lib/festival'
import { Button, type UpdateProject } from './ui'

export function DaySetup({ project, onChange, day }: { project: Project; onChange: UpdateProject; day: DayIndex }) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="mb-5 rounded border border-rule p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-bold">Day {day + 1} · {project.title || 'Festival meetings'}</h1>
          <p className="text-muted">{project.dms.length} decision makers · {project.teams.length} film teams · {project.slots.length} time slots</p>
        </div>
        {!editing && <Button onClick={() => setEditing(true)}>Edit setup</Button>}
      </div>
      <p className="mt-2 text-muted">Decision-maker names are shared across both days; removing a decision maker removes their meetings on both days. Film teams, requests, availability and meetings otherwise belong to this day only.</p>
      {!editing && <DelayControls project={project} onChange={onChange} day={day} />}
      {editing && <SetupEditor key={JSON.stringify([project.title, project.teams, project.dms, project.slots])} project={project} onChange={onChange} onClose={() => setEditing(false)} />}
    </section>
  )
}

function DelayControls({ project, onChange, day }: { project: Project; onChange: UpdateProject; day: DayIndex }) {
  const [error, setError] = useState('')
  return <div className="mt-3 border-t border-rule pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">Running late? Delay Day {day + 1}</span>
      {[5, 15, 20].map((minutes) => <Button key={minutes} onClick={() => {
        try {
          const shifted = delayTimes(project, minutes)
          onChange(() => shifted)
          setError('')
        } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
      }}>+{minutes} min</Button>)}
    </div>
    <p role="status" className="mt-2">First slot: {slotLabel(project, project.slots[0]?.id ?? '')}</p>
    <p className="mt-1 text-muted">Shifts every time slot on this day, including exports. Meetings stay exactly where they are. Click again to add more time; Undo reverses a delay.</p>
    {error && <p role="alert" className="mt-1 text-warn">{error}</p>}
  </div>
}

function SetupEditor({ project, onChange, onClose }: { project: Project; onChange: UpdateProject; onClose: () => void }) {
  const [title, setTitle] = useState(project.title)
  const [dms, setDms] = useState(rosterText(project.dms))
  const [teams, setTeams] = useState(rosterText(project.teams))
  const [slots, setSlots] = useState(project.slots.map((s) => slotLabel(project, s.id)).join('\n'))
  const [start, setStart] = useState('15:00')
  const [slotCount, setSlotCount] = useState(12)
  const generated = quarterHourSlots(start, slotCount)
  const count = parseLines(slots).length
  const fields = [
    { label: 'Decision makers · both days', value: dms, set: setDms },
    { label: 'Film teams', value: teams, set: setTeams },
    { label: 'Time slots', value: slots, set: setSlots },
  ]
  return (
    <div className="mt-3 space-y-3">
      <label className="block font-semibold">Event / day
        <input className="mt-1 block w-full rounded border border-rule bg-paper p-2 font-normal" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <p className="text-muted">One entry per line; paste lists here. Names can include “ | Organisation, Country”, “ = Short code” and a trailing * for online.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map(({ label, value, set }) => <label key={label} className="block font-semibold">{label}
          <textarea className="mt-1 block w-full rounded border border-rule bg-paper p-2 font-mono text-sm font-normal" rows={10} value={value} onChange={(e) => set(e.target.value)} />
        </label>)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>First meeting<input type="time" className="ml-2 rounded border border-rule bg-paper p-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Number of time slots<input type="number" min={1} max={MAX_SLOTS} className="ml-2 w-16 rounded border border-rule bg-paper p-1" value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value))} /></label>
        <Button disabled={!generated.length} onClick={() => setSlots(generated.join('\n'))}>Use 15-minute slots</Button>
        <span className="text-muted">Replaces this day's time-slot draft. Edit the list to leave breaks.</span>
      </div>
      {!generated.length && <p role="alert" className="text-warn">Choose a valid start time and 1–60 slots ending no later than midnight.</p>}
      <p className="text-muted">Line position is the identity: rename in place to keep requests and meetings. Inserting, deleting or reordering lines reassigns those positions. Removed trailing entries lose their meetings. Blank lines and duplicate names are ignored. Nothing is automatically rebuilt.</p>
      {(count < 1 || count > MAX_SLOTS) && <p role="alert" className="text-warn">Enter between 1 and {MAX_SLOTS} time slots.</p>}
      <div className="flex gap-2">
        <Button disabled={count < 1 || count > MAX_SLOTS} onClick={() => { onChange((p) => withDaySetup(p, title, teams, dms, slots)); onClose() }}>Apply setup</Button>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}
