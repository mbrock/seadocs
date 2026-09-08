import { useState } from 'react'
import { MAX_SLOTS, parseLines, rosterText, slotLabel, type Project } from '../lib/project'
import { withDaySetup } from '../lib/setup'
import { Button, type UpdateProject } from './ui'

export function DaySetup({ project, onChange }: { project: Project; onChange: UpdateProject }) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="mb-5 rounded border border-rule p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-bold">{project.title || 'Festival meeting board'}</h1>
          <p className="text-muted">{project.dms.length} decision makers · {project.teams.length} film teams · {project.slots.length} time slots</p>
        </div>
        {!editing && <Button onClick={() => setEditing(true)}>Edit setup</Button>}
      </div>
      {editing && <SetupEditor key={JSON.stringify([project.title, project.teams, project.dms, project.slots])} project={project} onChange={onChange} onClose={() => setEditing(false)} />}
    </section>
  )
}

function SetupEditor({ project, onChange, onClose }: { project: Project; onChange: UpdateProject; onClose: () => void }) {
  const [title, setTitle] = useState(project.title)
  const [dms, setDms] = useState(rosterText(project.dms))
  const [teams, setTeams] = useState(rosterText(project.teams))
  const [slots, setSlots] = useState(project.slots.map((s) => slotLabel(project, s.id)).join('\n'))
  const count = parseLines(slots).length
  const fields = [
    { label: 'Decision makers', value: dms, set: setDms },
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
      <p className="text-muted">Line position is the identity: rename in place to keep requests and meetings. Inserting, deleting or reordering lines reassigns those positions. Removed trailing entries lose their meetings. Blank lines and duplicate names are ignored. Nothing is automatically rebuilt.</p>
      {(count < 1 || count > MAX_SLOTS) && <p role="alert" className="text-warn">Enter between 1 and {MAX_SLOTS} time slots.</p>}
      <div className="flex gap-2">
        <Button disabled={count < 1 || count > MAX_SLOTS} onClick={() => { onChange((p) => withDaySetup(p, title, teams, dms, slots)); onClose() }}>Apply setup</Button>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}
