import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { sampleProject } from '../lib/sample'
import { demoProject } from '../lib/fixtures'
import { parseLines, parseRoster, reconcileParticipants, rosterText, slotLabel, withParticipants, withSlots, withTitle, type Project } from '../lib/project'
import { Button, Label, Panel, PanelHeader, Segmented, inputClass, textareaClass } from './ui'
import { InterestPanel } from './InterestPanel'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  title: string
  teamsText: string
  dmsText: string
  /** One slot per line; the line is the slot's label. */
  slotsText: string
}

function draftsFrom(project: Project): Drafts {
  return {
    title: project.title,
    teamsText: rosterText(project.teams),
    dmsText: rosterText(project.dms),
    slotsText: project.slots.map((s) => slotLabel(project, s.id)).join('\n'),
  }
}

const same = (a: Drafts, b: Drafts) => (Object.keys(a) as (keyof Drafts)[]).every((k) => a[k] === b[k])

/** Who is coming and when: the rosters, the slot times, the event title. */
export function SetupPanel({ project, onChange }: Props) {
  // Drafts live here until "Apply". The parent keeps this component mounted
  // across top-level views; request-only project changes do not reset them.
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [source, setSource] = useState(() => ({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title }))
  const [step, setStep] = useState<'people' | 'requests'>('people')
  const sourceChanged = source.teams !== project.teams || source.dms !== project.dms || source.slots !== project.slots || source.title !== project.title
  const wasDirty = !same(drafts, {
    title: source.title,
    teamsText: rosterText(source.teams),
    dmsText: rosterText(source.dms),
    slotsText: source.slots.map((s, i) => s.label || `Slot ${i + 1}`).join('\n'),
  })
  if (sourceChanged && !wasDirty) {
    setSource({ teams: project.teams, dms: project.dms, slots: project.slots, title: project.title })
    setDrafts(draftsFrom(project))
  }
  const edit = (patch: Partial<Drafts>) => setDrafts((d) => ({ ...d, ...patch }))
  const dirty = !same(drafts, draftsFrom(project))
  const teamCount = parseRoster(drafts.teamsText).length
  const dmCount = parseRoster(drafts.dmsText).length
  const slotCount = parseLines(drafts.slotsText).length
  const duplicateNames = [...duplicates(drafts.teamsText), ...duplicates(drafts.dmsText)]
  const reconciliation = useMemo(
    () => reconcileParticipants(project, parseRoster(drafts.teamsText), parseRoster(drafts.dmsText)),
    [project, drafts.teamsText, drafts.dmsText],
  )
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
    let next = withParticipants(project, parseRoster(drafts.teamsText), parseRoster(drafts.dmsText))
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
        <div className="p-4">
          <textarea
            id="teamsInput"
            aria-label="Teams, one per line"
            className={`${textareaClass} min-h-[24rem]`}
            placeholder={'One project per line'}
            value={drafts.teamsText}
            onChange={(e) => edit({ teamsText: e.target.value })}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            One title per line. The board shows a one-word code picked from the title; write <b>Title = Code</b> to choose it yourself.
          </p>
        </div>
        </Panel>

        <Panel>
        <PanelHeader title={`Decision makers · ${dmCount}`} />
        <div className="p-4">
          <textarea
            id="dmsInput"
            aria-label="Decision makers, one per line"
            className={`${textareaClass} min-h-[24rem]`}
            placeholder={'One person per line\nName | Organisation, Country\nEnd a line with * for someone joining online'}
            value={drafts.dmsText}
            onChange={(e) => edit({ dmsText: e.target.value })}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            One per line as <b>Name | Organisation, Country</b> — the country becomes a tag and long names are shortened on the board. A trailing <b>*</b> marks
            someone joining online. <b>Name = Code</b> sets the short form.
          </p>
        </div>
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

function duplicates(text: string): string[] {
  const names = text.split('\n').map((line) => {
    let value = line.trim()
    if (value.endsWith('*')) value = value.slice(0, -1).trim()
    const eq = value.lastIndexOf(' = ')
    return (eq >= 0 ? value.slice(0, eq) : value).trim()
  }).filter(Boolean)
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const name of names) {
    const key = name.replace(/\s+/g, ' ').toLocaleLowerCase()
    if (seen.has(key)) duplicate.add(name)
    seen.add(key)
  }
  return [...duplicate]
}
