import { useState, type Dispatch, type SetStateAction } from 'react'
import { asked, type Id } from '../lib/scheduler'
import { countryCode, parseName, surname } from '../lib/names'
import {
  parseRoster,
  reconcileParticipants,
  rosterText,
  withAsk,
  withAsks,
  withParticipants,
  type AskKind,
  type Project,
  type RosterEntry,
} from '../lib/project'
import { Button } from './ui'

const textareaClass = 'w-full resize-y rounded-[3px] border border-rule bg-paper px-2 py-1 text-[0.85rem] leading-[1.5] focus:border-ink focus:outline-none'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  teams: RosterRow[]
  dms: RosterRow[]
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
    teams: rowsFrom(project.teams),
    dms: rowsFrom(project.dms),
  }
}

const same = (a: Drafts, b: Drafts) =>
  (['teams', 'dms'] as const).every((side) =>
    a[side].length === b[side].length && a[side].every((item, index) => item.id === b[side][index].id && item.text === b[side][index].text),
  )

/** One editable matrix for participants and both sides' requests. */
export function SetupPanel({ project, onChange }: Props) {
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [source, setSource] = useState(() => ({ teams: project.teams, dms: project.dms }))
  const [paste, setPaste] = useState({ team: '', dm: '' })
  const [pasteNote, setPasteNote] = useState({ team: '', dm: '' })
  const sourceChanged = source.teams !== project.teams || source.dms !== project.dms
  const wasDirty = !same(drafts, {
    teams: rowsFrom(source.teams),
    dms: rowsFrom(source.dms),
  })
  if (sourceChanged && !wasDirty) {
    setSource({ teams: project.teams, dms: project.dms })
    setDrafts(draftsFrom(project))
  }

  const edit = (patch: Partial<Drafts>) => setDrafts((current) => ({ ...current, ...patch }))
  const dirty = !same(drafts, draftsFrom(project))
  const teamEntries = entriesFrom(drafts.teams)
  const dmEntries = entriesFrom(drafts.dms)
  const duplicateNames = [...duplicates(teamEntries), ...duplicates(dmEntries)]
  const reconciliation = reconcileParticipants(project, teamEntries, dmEntries, true)
  const blocked = duplicateNames.length > 0 || reconciliation.ambiguous.length > 0
  const removedParticipantIds = new Set(reconciliation.changes.filter((change) => change.kind === 'deleted').map((change) => change.id))
  const removedMeetings = project.meetings.filter(
    (meeting) => removedParticipantIds.has(meeting.team) || removedParticipantIds.has(meeting.dm),
  ).length
  const removedAvailability = [...project.teams, ...project.dms].reduce(
    (count, person) => count + (removedParticipantIds.has(person.id) ? (person.unavailable?.length ?? 0) : 0),
    0,
  )

  function apply() {
    if (blocked) return
    const removed = reconciliation.removed
    if (
      removed.participants > 0 &&
      !confirm(
        `Apply these deletions?\n\n${removed.participants} participant(s)\n` +
          `${removed.dmAsks + removed.teamAsks} request(s), ${removedMeetings} meeting(s), and ${removedAvailability} availability mark(s) will be removed.\n\nYou can Undo after applying.`,
      )
    ) return
    const next = withParticipants(project, teamEntries, dmEntries, true)
    onChange(next)
    setSource({ teams: next.teams, dms: next.dms })
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

  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[0.75rem] text-muted">
          <span><span className="mr-1 inline-block h-3 w-3 rounded-[2px] border border-gold-3 bg-gold-2 align-[-1px]" />DM request</span>
          <span><span className="mr-1 inline-block h-3 w-3 rounded-[2px] border border-sea-3 bg-sea-2 align-[-1px]" />team request</span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Button variant="quiet" onClick={() => edit({ dms: [...drafts.dms, row()] })}>+ DM</Button>
          <Button variant="primary" onClick={apply} disabled={!dirty || blocked}>Apply edits</Button>
          <Button variant="quiet" onClick={() => confirm('Clear all decision maker requests?') && onChange(withAsks(project, {}, project.teamAsks))}>Clear DM requests</Button>
          <Button variant="quiet" onClick={() => confirm('Clear all team requests?') && onChange(withAsks(project, project.dmAsks, {}))}>Clear team requests</Button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-7rem)] overflow-auto pb-3">
        <table className="mr-16 w-max border-separate border-spacing-0 text-[0.8rem]">
            <thead className="sticky top-0 z-20 bg-paper">
              <tr>
                <th className="sticky left-0 z-30 h-20 w-52 max-w-52 border-b border-rule bg-paper px-2 pb-1 text-left align-bottom font-semibold">Team</th>
                {drafts.dms.map((dm, index) => (
                  <th key={dm.key} className="group relative h-20 w-12 min-w-12 overflow-visible p-0 align-bottom font-normal">
                    <EditableName
                      angled
                      label={`DM ${index + 1}`}
                      placeholder="Name | Organisation, Country"
                      value={dm.text}
                      onChange={(text) => updateRow('dms', dm.key, text)}
                      onDelete={() => edit({ dms: drafts.dms.filter((item) => item.key !== dm.key) })}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="outline outline-1 outline-rule">
              {drafts.teams.map((team, teamIndex) => (
                <tr key={team.key} className="group">
                  <th className="sticky left-0 z-10 w-52 max-w-52 border-l border-b border-rule bg-paper px-2 py-1 text-left font-normal group-hover:bg-canvas">
                    <EditableName
                      label={`team ${teamIndex + 1}`}
                      placeholder="Film team"
                      value={team.text}
                      onChange={(text) => updateRow('teams', team.key, text)}
                      onDelete={() => edit({ teams: drafts.teams.filter((item) => item.key !== team.key) })}
                    />
                  </th>
                  {drafts.dms.map((dm) => (
                    <td key={dm.key} className="border-l border-b border-rule/70 px-1 py-1.5 group-hover:bg-canvas/50">
                      {team.id && dm.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <AskCheckbox kind="dm" checked={asked(project.dmAsks, team.id, dm.id)} team={team.id} dm={dm.id} teamName={team.text} dmName={dm.text} onChange={onChange} />
                          <AskCheckbox kind="team" checked={asked(project.teamAsks, team.id, dm.id)} team={team.id} dm={dm.id} teamName={team.text} dmName={dm.text} onChange={onChange} />
                        </div>
                      ) : (
                        <span className="block text-center text-muted" title="Apply names to enable requests">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 bg-paper px-2 py-1">
                  <Button variant="quiet" onClick={() => edit({ teams: [...drafts.teams, row()] })}>+ film team</Button>
                </td>
                <td colSpan={Math.max(1, drafts.dms.length)} />
              </tr>
            </tbody>
        </table>
      </div>

      <details className="mt-3 border-t border-rule pt-3">
        <summary className="cursor-pointer text-[0.82rem] font-semibold text-muted">Paste names</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <PasteNames label="film teams" value={paste.team} note={pasteNote.team} onChange={(text) => setPaste((current) => ({ ...current, team: text }))} onAdd={() => addPasted('team')} />
          <PasteNames label="decision makers" value={paste.dm} note={pasteNote.dm} onChange={(text) => setPaste((current) => ({ ...current, dm: text }))} onAdd={() => addPasted('dm')} />
        </div>
      </details>
      {dirty && !blocked && <p className="mt-1 text-[0.78rem] text-muted">Roster edits not yet applied.</p>}
      {duplicateNames.length > 0 && <p className="mt-1 text-[0.8rem] font-semibold text-warn">Names must be unique: {duplicateNames.join(', ')}</p>}
      {reconciliation.ambiguous.map((item) => (
        <p key={item.side} className="mt-1 text-[0.8rem] font-semibold text-warn">Could not match edited {item.side === 'team' ? 'teams' : 'decision makers'} safely.</p>
      ))}
    </section>
  )
}

function EditableName({ angled = false, label, placeholder, value, onChange, onDelete }: { angled?: boolean; label: string; placeholder: string; value: string; onChange: (text: string) => void; onDelete: () => void }) {
  const entry = parseRoster(value)[0]
  const parsed = parseName(entry?.name ?? value)
  const short = entry?.code || surname(parsed.person)
  const tag = countryCode(parsed.country)
  if (angled) {
    return (
      <>
        <input
          aria-label={label}
          className="peer absolute bottom-0 left-0 z-10 w-40 origin-bottom-left -rotate-[22deg] bg-transparent py-1 pl-2 text-[0.8rem] text-transparent focus:z-30 focus:bg-paper focus:text-ink focus:outline-1 focus:outline-ink"
          placeholder={placeholder}
          title={value}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute bottom-0 left-0 z-20 inline-flex origin-bottom-left -rotate-[22deg] items-center border-b border-rule pl-2 whitespace-nowrap peer-focus:hidden">
          {short}
          {tag && <span className="ml-1 rounded-[2px] border border-current/30 px-[3px] text-[0.58rem] font-bold tracking-[0.08em] opacity-70">{tag}</span>}
        </span>
        <button type="button" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete} className="absolute right-0 bottom-0 z-20 px-0.5 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-warn">×</button>
      </>
    )
  }
  return (
    <div className="flex items-center gap-0.5">
      <input
        aria-label={label}
        className="w-0 min-w-0 flex-1 bg-transparent p-0 text-[0.8rem] focus:bg-paper focus:outline-1 focus:outline-ink"
        placeholder={placeholder}
        title={value}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete} className="shrink-0 px-0.5 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-warn">×</button>
    </div>
  )
}

function PasteNames({ label, value, note, onChange, onAdd }: { label: string; value: string; note: string; onChange: (text: string) => void; onAdd: () => void }) {
  return (
    <div>
      <label className="eyebrow mb-1 block">Paste {label}</label>
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
