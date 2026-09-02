import { useState, type Dispatch, type SetStateAction } from 'react'
import { asked, type Id } from '../lib/scheduler'
import { sampleProject } from '../lib/sample'
import {
  parseLines,
  parseRoster,
  reconcileParticipants,
  rosterText,
  slotLabel,
  withAsk,
  withAsks,
  withParticipants,
  withSlots,
  withTitle,
  type AskKind,
  type Project,
  type RosterEntry,
} from '../lib/project'
import { Button, Label, inputClass, textareaClass } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  title: string
  teams: RosterRow[]
  dms: RosterRow[]
  slotsText: string
}

interface RosterRow {
  key: string
  id?: Id
  text: string
}

let nextDraftKey = 1
const row = (text = '', id?: Id): RosterRow => ({ key: `row-${nextDraftKey++}`, id, text })
const rowsFrom = (people: Project['teams']): RosterRow[] => people.map((person) => row(rosterText([person]), person.id))
const entriesFrom = (rows: RosterRow[]): RosterEntry[] => rows.flatMap((item) => parseRoster(item.text).map((entry) => ({ ...entry, id: item.id })))
const entryText = (entry: RosterEntry) => `${entry.name}${entry.code ? ` = ${entry.code}` : ''}${entry.online ? ' *' : ''}`

function draftsFrom(project: Project): Drafts {
  return {
    title: project.title,
    teams: rowsFrom(project.teams),
    dms: rowsFrom(project.dms),
    slotsText: project.slots.map((slot) => slotLabel(project, slot.id)).join('\n'),
  }
}

const same = (a: Drafts, b: Drafts) =>
  a.title === b.title && a.slotsText === b.slotsText &&
  (['teams', 'dms'] as const).every((side) =>
    a[side].length === b[side].length && a[side].every((item, index) => item.id === b[side][index].id && item.text === b[side][index].text),
  )

/** One editable matrix for participants and both sides' requests, with day settings alongside it. */
export function SetupPanel({ project, onChange }: Props) {
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [source, setSource] = useState(() => ({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title }))
  const [paste, setPaste] = useState({ team: '', dm: '' })
  const [pasteNote, setPasteNote] = useState({ team: '', dm: '' })
  const sourceChanged = source.teams !== project.teams || source.dms !== project.dms || source.slots !== project.slots || source.title !== project.title
  const wasDirty = !same(drafts, {
    title: source.title,
    teams: rowsFrom(source.teams),
    dms: rowsFrom(source.dms),
    slotsText: source.slots.map((slot, index) => slot.label || `Slot ${index + 1}`).join('\n'),
  })
  if (sourceChanged && !wasDirty) {
    setSource({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title })
    setDrafts(draftsFrom(project))
  }

  const edit = (patch: Partial<Drafts>) => setDrafts((current) => ({ ...current, ...patch }))
  const dirty = !same(drafts, draftsFrom(project))
  const teamEntries = entriesFrom(drafts.teams)
  const dmEntries = entriesFrom(drafts.dms)
  const duplicateNames = [...duplicates(teamEntries), ...duplicates(dmEntries)]
  const reconciliation = reconcileParticipants(project, teamEntries, dmEntries, true)
  const blocked = duplicateNames.length > 0 || reconciliation.ambiguous.length > 0
  const slotCount = parseLines(drafts.slotsText).length
  const removedSlots = Math.max(0, project.slots.length - Math.max(1, slotCount))
  const removedSlotIds = new Set(project.slots.slice(project.slots.length - removedSlots).map((slot) => slot.id))
  const removedParticipantIds = new Set(reconciliation.changes.filter((change) => change.kind === 'deleted').map((change) => change.id))
  const removedMeetings = project.meetings.filter(
    (meeting) => removedSlotIds.has(meeting.slot) || removedParticipantIds.has(meeting.team) || removedParticipantIds.has(meeting.dm),
  ).length
  const removedAvailability = [...project.teams, ...project.dms].reduce(
    (count, person) => count + (person.unavailable ?? []).filter((slot) => removedParticipantIds.has(person.id) || removedSlotIds.has(slot)).length,
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
    next = withSlots(next, parseLines(drafts.slotsText).map((label, index) => (label === `Slot ${index + 1}` ? '' : label)))
    next = withTitle(next, drafts.title)
    onChange(next)
    setSource({ teams: next.teams, dms: next.dms, slots: next.slots, title: next.title })
    setDrafts(draftsFrom(next))
  }

  function updateRow(side: 'teams' | 'dms', key: string, text: string) {
    edit({ [side]: drafts[side].map((item) => item.key === key ? { ...item, text } : item) })
  }

  function addPasted(side: 'team' | 'dm') {
    const field = side === 'team' ? 'teams' : 'dms'
    const incoming = parseRoster(paste[side])
    const known = new Set(entriesFrom(drafts[field]).map((entry) => normalize(entry.name)))
    const added = incoming.filter((entry) => !known.has(normalize(entry.name)))
    edit({ [field]: [...drafts[field], ...added.map((entry) => row(entryText(entry)))] })
    setPaste((current) => ({ ...current, [side]: '' }))
    setPasteNote((current) => ({
      ...current,
      [side]: `${added.length} added${incoming.length > added.length ? ` · ${incoming.length - added.length} already present` : ''}`,
    }))
  }

  function loadSample() {
    const hasWork = project.teams.length > 0 || project.dms.length > 0 || Object.keys(project.dmAsks).length > 0 || Object.keys(project.teamAsks).length > 0
    if (hasWork && !confirm('Replace the current project with the sample? You can Undo afterwards.')) return
    const next = sampleProject()
    onChange(next)
    setSource({ teams: next.teams, dms: next.dms, slots: next.slots, title: next.title })
    setDrafts(draftsFrom(next))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[0.75rem] text-muted">
            <span><span className="mr-1 inline-block h-3 w-3 rounded-[2px] border border-gold-3 bg-gold-2 align-[-1px]" />DM request</span>
            <span><span className="mr-1 inline-block h-3 w-3 rounded-[2px] border border-sea-3 bg-sea-2 align-[-1px]" />team request</span>
          </div>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => confirm('Clear all decision maker requests?') && onChange(withAsks(project, {}, project.teamAsks))}>Clear DM requests</Button>
            <Button variant="quiet" onClick={() => confirm('Clear all team requests?') && onChange(withAsks(project, project.dmAsks, {}))}>Clear team requests</Button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-[4px] border border-rule bg-paper">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[0.8rem]">
            <thead className="sticky top-0 z-20 bg-paper">
              <tr>
                <th className="sticky left-0 z-30 min-w-64 border-r border-b border-rule bg-paper p-2 text-left align-bottom font-semibold">Team</th>
                {drafts.dms.map((dm, index) => (
                  <th key={dm.key} className="w-28 min-w-28 border-r border-b border-rule bg-paper p-1 align-bottom font-normal">
                    <EditableName
                      label={`DM ${index + 1}`}
                      placeholder="Name | Organisation, Country"
                      value={dm.text}
                      onChange={(text) => updateRow('dms', dm.key, text)}
                      onDelete={() => edit({ dms: drafts.dms.filter((item) => item.key !== dm.key) })}
                    />
                  </th>
                ))}
                <th className="sticky right-0 z-20 min-w-24 border-b border-rule bg-paper p-2 text-left align-bottom">
                  <Button variant="quiet" onClick={() => edit({ dms: [...drafts.dms, row()] })}>+ DM</Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {drafts.teams.map((team, teamIndex) => (
                <tr key={team.key} className="group">
                  <th className="sticky left-0 z-10 border-r border-b border-rule bg-paper p-1 text-left font-normal group-hover:bg-canvas">
                    <EditableName
                      label={`team ${teamIndex + 1}`}
                      placeholder="Film team"
                      value={team.text}
                      onChange={(text) => updateRow('teams', team.key, text)}
                      onDelete={() => edit({ teams: drafts.teams.filter((item) => item.key !== team.key) })}
                    />
                  </th>
                  {drafts.dms.map((dm) => (
                    <td key={dm.key} className="border-r border-b border-rule/70 p-2 group-hover:bg-canvas/50">
                      {team.id && dm.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <AskCheckbox kind="dm" checked={asked(project.dmAsks, team.id, dm.id)} team={team.id} dm={dm.id} teamName={team.text} dmName={dm.text} onChange={onChange} />
                          <AskCheckbox kind="team" checked={asked(project.teamAsks, team.id, dm.id)} team={team.id} dm={dm.id} teamName={team.text} dmName={dm.text} onChange={onChange} />
                        </div>
                      ) : (
                        <span className="block text-center text-muted" title="Apply names to enable requests">—</span>
                      )}
                    </td>
                  ))}
                  <td className="sticky right-0 border-b border-rule bg-paper" />
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 border-r border-rule bg-paper p-2">
                  <Button variant="quiet" onClick={() => edit({ teams: [...drafts.teams, row()] })}>+ film team</Button>
                </td>
                <td colSpan={Math.max(1, drafts.dms.length + 1)} />
              </tr>
            </tbody>
          </table>
        </div>

        <details className="mt-3 rounded-[4px] border border-rule bg-paper p-3">
          <summary className="cursor-pointer text-[0.82rem] font-semibold text-muted">Paste names</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <PasteNames label="film teams" value={paste.team} note={pasteNote.team} onChange={(text) => setPaste((current) => ({ ...current, team: text }))} onAdd={() => addPasted('team')} />
            <PasteNames label="decision makers" value={paste.dm} note={pasteNote.dm} onChange={(text) => setPaste((current) => ({ ...current, dm: text }))} onAdd={() => addPasted('dm')} />
          </div>
        </details>
      </section>

      <aside className="flex flex-col gap-3">
        <div>
          <Label htmlFor="eventTitle">Event</Label>
          <input id="eventTitle" className={`${inputClass} w-full`} placeholder="Event and day" value={drafts.title} onChange={(event) => edit({ title: event.target.value })} />
        </div>
        <div>
          <Label htmlFor="slotLabels">Meeting times</Label>
          <textarea id="slotLabels" className={`${textareaClass} min-h-56`} placeholder={'15:20\n15:40\n…'} value={drafts.slotsText} onChange={(event) => edit({ slotsText: event.target.value })} />
          <p className="mt-1 text-[0.78rem] text-muted">One per line, in order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={apply} disabled={!dirty || blocked}>Apply edits</Button>
          {dirty && !blocked && <span className="text-[0.78rem] text-muted">Not yet applied</span>}
        </div>
        {duplicateNames.length > 0 && <p className="text-[0.8rem] font-semibold text-warn">Names must be unique: {duplicateNames.join(', ')}</p>}
        {reconciliation.ambiguous.map((item) => (
          <p key={item.side} className="text-[0.8rem] font-semibold text-warn">Could not match edited {item.side === 'team' ? 'teams' : 'decision makers'} safely.</p>
        ))}
        <Button className="self-start" onClick={loadSample}>Load sample day</Button>
      </aside>
    </div>
  )
}

function EditableName({ label, placeholder, value, onChange, onDelete }: { label: string; placeholder: string; value: string; onChange: (text: string) => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <input aria-label={label} className={`${inputClass} w-0 min-w-0 flex-1`} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete} className="px-1 text-muted hover:text-warn">×</button>
    </div>
  )
}

function PasteNames({ label, value, note, onChange, onAdd }: { label: string; value: string; note: string; onChange: (text: string) => void; onAdd: () => void }) {
  return (
    <div>
      <Label>Paste {label}</Label>
      <textarea aria-label={`Paste ${label}`} className={`${textareaClass} min-h-24`} placeholder="One per line" value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={onAdd} disabled={parseRoster(value).length === 0}>Add names</Button>
        {note && <span className="text-[0.78rem] text-muted">{note}</span>}
      </div>
    </div>
  )
}

function AskCheckbox({ kind, checked, team, dm, teamName, dmName, onChange }: { kind: AskKind; checked: boolean; team: Id; dm: Id; teamName: string; dmName: string; onChange: Dispatch<SetStateAction<Project>> }) {
  const who = kind === 'dm' ? dmName : teamName
  const target = kind === 'dm' ? teamName : dmName
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => {
        const wants = event.currentTarget.checked
        onChange((current) => withAsk(current, kind, team, dm, wants))
      }}
      aria-label={`${kind === 'dm' ? 'DM' : 'Team'} request: ${who} asks for ${target}`}
      title={`${who} ${checked ? 'asks' : 'does not ask'} for ${target}`}
      className={`h-4 w-4 cursor-pointer rounded-[2px] ${kind === 'dm' ? 'accent-gold-3' : 'accent-sea-3'}`}
    />
  )
}

const normalize = (name: string) => name.replace(/\s+/g, ' ').toLocaleLowerCase()

function duplicates(entries: RosterEntry[]): string[] {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const entry of entries) {
    const key = normalize(entry.name)
    if (seen.has(key)) duplicate.add(entry.name)
    seen.add(key)
  }
  return [...duplicate]
}
