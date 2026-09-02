import { useState, type Dispatch, type SetStateAction } from 'react'
import { sampleProject } from '../lib/sample'
import { demoProject } from '../lib/fixtures'
import { parseLines, parseRoster, reconcileParticipants, rosterText, slotLabel, withParticipants, withSlots, withTitle, type Project, type RosterEntry } from '../lib/project'
import { Button, Label, Panel, PanelHeader, Segmented, inputClass, textareaClass } from './ui'
import { InterestPanel } from './InterestPanel'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  title: string
  teams: RosterRow[]
  dms: RosterRow[]
  /** One slot per line; the line is the slot's label. */
  slotsText: string
}

interface RosterRow {
  key: string
  id?: string
  text: string
}

let nextDraftKey = 1
const row = (text = '', id?: string): RosterRow => ({ key: `row-${nextDraftKey++}`, id, text })
const rowsFrom = (people: Project['teams']): RosterRow[] => people.map((p) => row(rosterText([p]), p.id))
const entriesFrom = (rows: RosterRow[]): RosterEntry[] => rows.flatMap((r) => parseRoster(r.text).map((entry) => ({ ...entry, id: r.id })))
const entryText = (e: RosterEntry) => `${e.name}${e.code ? ` = ${e.code}` : ''}${e.online ? ' *' : ''}`

function draftsFrom(project: Project): Drafts {
  return {
    title: project.title,
    teams: rowsFrom(project.teams),
    dms: rowsFrom(project.dms),
    slotsText: project.slots.map((s) => slotLabel(project, s.id)).join('\n'),
  }
}

const same = (a: Drafts, b: Drafts) =>
  a.title === b.title && a.slotsText === b.slotsText &&
  (['teams', 'dms'] as const).every((side) => a[side].length === b[side].length && a[side].every((r, i) => r.id === b[side][i].id && r.text === b[side][i].text))

/** Who is coming and when: the rosters, the slot times, the event title. */
export function SetupPanel({ project, onChange }: Props) {
  // Drafts live here until "Apply". The parent keeps this component mounted
  // across top-level views; request-only project changes do not reset them.
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [source, setSource] = useState(() => ({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title }))
  const [step, setStep] = useState<'people' | 'requests'>('people')
  const [paste, setPaste] = useState({ team: '', dm: '' })
  const [pasteNote, setPasteNote] = useState({ team: '', dm: '' })
  const sourceChanged = source.teams !== project.teams || source.dms !== project.dms || source.slots !== project.slots || source.title !== project.title
  const wasDirty = !same(drafts, {
    title: source.title,
    teams: rowsFrom(source.teams),
    dms: rowsFrom(source.dms),
    slotsText: source.slots.map((s, i) => s.label || `Slot ${i + 1}`).join('\n'),
  })
  if (sourceChanged && !wasDirty) {
    setSource({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title })
    setDrafts(draftsFrom(project))
  }
  const edit = (patch: Partial<Drafts>) => setDrafts((d) => ({ ...d, ...patch }))
  const dirty = !same(drafts, draftsFrom(project))
  const teamEntries = entriesFrom(drafts.teams)
  const dmEntries = entriesFrom(drafts.dms)
  const teamCount = teamEntries.length
  const dmCount = dmEntries.length
  const slotCount = parseLines(drafts.slotsText).length
  const duplicateNames = [...duplicates(teamEntries), ...duplicates(dmEntries)]
  const reconciliation = reconcileParticipants(project, teamEntries, dmEntries, true)
  const blocked = duplicateNames.length > 0 || reconciliation.ambiguous.length > 0
  const removedSlots = Math.max(0, project.slots.length - Math.max(1, slotCount))
  const removedSlotIds = new Set(project.slots.slice(project.slots.length - removedSlots).map((s) => s.id))
  const removedParticipantIds = new Set(reconciliation.changes.filter((c) => c.kind === 'deleted').map((c) => c.id))
  const removedMeetings = project.meetings.filter((m) => removedSlotIds.has(m.slot) || removedParticipantIds.has(m.team) || removedParticipantIds.has(m.dm)).length
  const removedAvailability = [...project.teams, ...project.dms].reduce(
    (count, p) => count + (p.unavailable ?? []).filter((slot) => removedParticipantIds.has(p.id) || removedSlotIds.has(slot)).length,
    0,
  )

  function apply() {
    if (blocked) return
    const removed = reconciliation.removed
    if (
      (removed.participants > 0 || removedSlots > 0) &&
      !confirm(
        `Apply these deletions?\n\n${removed.participants} participant(s), ${removedSlots} slot(s)\n` +
          `${removed.dmAsks + removed.teamAsks} request(s), ${removedMeetings} meeting(s), and ${removedAvailability} availability mark(s) will be removed.\n\nYou can Undo after applying.`,
      )
    ) return
    let next = withParticipants(project, teamEntries, dmEntries, true)
    // A line that is just the default label ("Slot 3" on line 3) is stored as no label.
    next = withSlots(
      next,
      parseLines(drafts.slotsText).map((label, i) => (label === `Slot ${i + 1}` ? '' : label)),
    )
    next = withTitle(next, drafts.title)
    onChange(next)
    setSource({ teams: next.teams, dms: next.dms, slots: next.slots, title: next.title })
    setDrafts(draftsFrom(next))
  }

  function updateRow(side: 'teams' | 'dms', key: string, text: string) {
    edit({ [side]: drafts[side].map((r) => r.key === key ? { ...r, text } : r) })
  }

  function moveRow(side: 'teams' | 'dms', index: number, delta: -1 | 1) {
    const rows = [...drafts[side]]
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    edit({ [side]: rows })
  }

  function addPasted(side: 'team' | 'dm') {
    const field = side === 'team' ? 'teams' : 'dms'
    const incoming = parseRoster(paste[side])
    const known = new Set(entriesFrom(drafts[field]).map((e) => e.name.replace(/\s+/g, ' ').toLocaleLowerCase()))
    const added = incoming.filter((e) => !known.has(e.name.replace(/\s+/g, ' ').toLocaleLowerCase()))
    edit({ [field]: [...drafts[field], ...added.map((e) => row(entryText(e)))] })
    setPaste((p) => ({ ...p, [side]: '' }))
    setPasteNote((n) => ({ ...n, [side]: `${added.length} added${incoming.length > added.length ? ` · ${incoming.length - added.length} already listed` : ''}` }))
  }

  function loadExample(next: Project) {
    const hasWork = project.teams.length > 0 || project.dms.length > 0 || Object.keys(project.dmAsks).length > 0 || Object.keys(project.teamAsks).length > 0
    if (hasWork && !confirm('Replace the current project with this example? You can Undo afterwards.')) return
    onChange(next)
    setSource({ teams: next.teams, dms: next.dms, slots: next.slots, title: next.title })
    setDrafts(draftsFrom(next))
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={step}
          onChange={setStep}
          label="Setup workflow"
          options={[
            { value: 'people', label: '1 · People & day' },
            { value: 'requests', label: '2 · Requests' },
          ]}
        />
        <span className="text-[0.8rem] text-muted">{project.teams.length} teams · {project.dms.length} DMs · {project.slots.length} slots</span>
      </div>

      <div hidden={step !== 'people'} className="grid gap-3 lg:grid-cols-[1fr_1fr_minmax(16rem,20rem)]">
        <Panel>
          <PanelHeader title={`Teams · ${teamCount}`} />
          <RosterEditor
            label="team"
            rows={drafts.teams}
            paste={paste.team}
            pasteNote={pasteNote.team}
            onPaste={(text) => setPaste((p) => ({ ...p, team: text }))}
            onAddPaste={() => addPasted('team')}
            onEdit={(key, text) => updateRow('teams', key, text)}
            onAdd={() => edit({ teams: [...drafts.teams, row()] })}
            onDelete={(key) => edit({ teams: drafts.teams.filter((r) => r.key !== key) })}
            onMove={(index, delta) => moveRow('teams', index, delta)}
          />
          <p className="mx-4 mb-4 text-[0.8rem] text-muted">
            One title per line. The board shows a one-word code picked from the title; write <b>Title = Code</b> to choose it yourself.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title={`Decision makers · ${dmCount}`} />
          <RosterEditor
            label="DM"
            rows={drafts.dms}
            paste={paste.dm}
            pasteNote={pasteNote.dm}
            onPaste={(text) => setPaste((p) => ({ ...p, dm: text }))}
            onAddPaste={() => addPasted('dm')}
            onEdit={(key, text) => updateRow('dms', key, text)}
            onAdd={() => edit({ dms: [...drafts.dms, row()] })}
            onDelete={(key) => edit({ dms: drafts.dms.filter((r) => r.key !== key) })}
            onMove={(index, delta) => moveRow('dms', index, delta)}
          />
          <p className="mx-4 mb-4 text-[0.8rem] text-muted">
            One per line as <b>Name | Organisation, Country</b> — the country becomes a tag and long names are shortened on the board. A trailing <b>*</b> marks
            someone joining online. <b>Name = Code</b> sets the short form.
          </p>
        </Panel>

        <div className="flex flex-col gap-3">
        <Panel>
          <PanelHeader title="Day" />
          <div className="grid gap-3 p-4">
            <div>
              <Label htmlFor="eventTitle">Event</Label>
              <input
                id="eventTitle"
                type="text"
                className={`${inputClass} w-full`}
                placeholder="Baltic Sea Docs 2026 · One-to-one meetings, day 1"
                value={drafts.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
              <p className="mt-1 text-[0.8rem] text-muted">Printed at the top of every running order.</p>
            </div>
            <div>
              <Label htmlFor="slotLabels">Slots · {slotCount}</Label>
              <textarea
                id="slotLabels"
                className={`${textareaClass} min-h-[12rem]`}
                placeholder={'15:20\n15:40\n…'}
                value={drafts.slotsText}
                onChange={(e) => edit({ slotsText: e.target.value })}
              />
              <p className="mt-1 text-[0.8rem] text-muted">One line per meeting slot, in order. Someone who cannot make a slot is marked on the board.</p>
            </div>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={apply} disabled={!dirty || blocked}>
            Apply
          </Button>
          {dirty && <span className="text-[0.8rem] text-muted">unapplied edits</span>}
        </div>

        {dirty && (
          <Panel>
            <PanelHeader title="Review changes" />
            <div className="grid gap-2 p-4 text-[0.82rem]">
              {duplicateNames.length > 0 && <p className="font-semibold text-warn">Duplicate names must be made unique: {duplicateNames.join(', ')}</p>}
              {reconciliation.ambiguous.map((a) => (
                <p key={a.side} className="font-semibold text-warn">
                  Cannot safely match {a.side === 'team' ? 'teams' : 'DMs'}: {a.oldNames.join(', ')} → {a.newNames.join(', ')}. Apply renames one at a time, separately from additions or deletions.
                </p>
              ))}
              {reconciliation.changes.map((change, i) => (
                <p key={`${change.kind}-${change.id}-${i}`}>
                  <b>{change.kind}</b>{change.kind === 'renamed' ? `: ${change.from} → ${change.to} (requests and schedule stay attached)` : `: ${change.from ?? change.to}`}
                </p>
              ))}
              {(reconciliation.removed.participants > 0 || removedSlots > 0) && (
                <p className="text-warn">
                  Deleting {reconciliation.removed.participants} participant(s) and {removedSlots} slot(s) will remove {reconciliation.removed.dmAsks + reconciliation.removed.teamAsks} request(s), {removedMeetings} meeting(s), and {removedAvailability} availability mark(s). Confirmation is required.
                </p>
              )}
              {!blocked && reconciliation.changes.length === 0 && removedSlots === 0 && <p className="text-muted">Only event or slot labels will change.</p>}
            </div>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Examples" />
          <div className="flex flex-wrap gap-2 p-4">
            <Button onClick={() => loadExample(sampleProject())}>BSD 2026 sample day</Button>
            <Button onClick={() => loadExample(demoProject())}>Random 26 × 26</Button>
          </div>
        </Panel>
        </div>
      </div>

      <div hidden={step !== 'requests'}>
        {dirty && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-gold-3 bg-gold-2 px-3 py-2 text-[0.85rem]">
            <span>Your people/day edits are still safe but not applied. Requests below use the currently applied roster.</span>
            <Button variant="primary" onClick={apply} disabled={blocked}>Apply people & day</Button>
          </div>
        )}
        <InterestPanel project={project} onChange={onChange} />
      </div>
    </div>
  )
}

function RosterEditor({
  label,
  rows,
  paste,
  pasteNote,
  onPaste,
  onAddPaste,
  onEdit,
  onAdd,
  onDelete,
  onMove,
}: {
  label: 'team' | 'DM'
  rows: RosterRow[]
  paste: string
  pasteNote: string
  onPaste: (text: string) => void
  onAddPaste: () => void
  onEdit: (key: string, text: string) => void
  onAdd: () => void
  onDelete: (key: string) => void
  onMove: (index: number, delta: -1 | 1) => void
}) {
  return (
    <div className="p-4">
      <div className="grid gap-1">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-right text-[0.72rem] tabular-nums text-muted">{i + 1}</span>
            <input
              aria-label={`${label} ${i + 1}`}
              className={`${inputClass} min-w-0 flex-1`}
              placeholder={label === 'team' ? 'Project title' : 'Name | Organisation, Country'}
              value={r.text}
              onChange={(e) => onEdit(r.key, e.target.value)}
            />
            <button type="button" aria-label={`Move ${label} ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => onMove(i, -1)} className="px-1 text-muted disabled:opacity-25">↑</button>
            <button type="button" aria-label={`Move ${label} ${i + 1} down`} title="Move down" disabled={i === rows.length - 1} onClick={() => onMove(i, 1)} className="px-1 text-muted disabled:opacity-25">↓</button>
            <button type="button" aria-label={`Delete ${label} ${i + 1}`} title="Delete" onClick={() => onDelete(r.key)} className="px-1 text-muted hover:text-warn">×</button>
          </div>
        ))}
        {!rows.length && <p className="py-3 text-center text-[0.8rem] text-muted">No {label === 'team' ? 'teams' : 'decision makers'} yet.</p>}
      </div>
      <Button variant="quiet" className="mt-2" onClick={onAdd}>+ add {label}</Button>
      <details className="mt-3 border-t border-rule pt-3">
        <summary className="cursor-pointer text-[0.8rem] font-semibold text-muted">Paste a list to add</summary>
        <textarea
          aria-label={`Paste ${label} list`}
          className={`${textareaClass} mt-2 min-h-24`}
          placeholder="One per line. Existing rows are kept."
          value={paste}
          onChange={(e) => onPaste(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={onAddPaste} disabled={parseRoster(paste).length === 0}>Add pasted {label}s</Button>
          {pasteNote && <span className="text-[0.78rem] text-muted">{pasteNote}</span>}
        </div>
      </details>
    </div>
  )
}

function duplicates(entries: RosterEntry[]): string[] {
  const names = entries.map((entry) => entry.name)
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const name of names) {
    const key = name.replace(/\s+/g, ' ').toLocaleLowerCase()
    if (seen.has(key)) duplicate.add(name)
    seen.add(key)
  }
  return [...duplicate]
}
