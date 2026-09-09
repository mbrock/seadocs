import { useEffect, useRef, useState, type ReactNode } from 'react'
import { askedBy } from '../lib/describe'
import { asksFor, availabilityOfProject, freeSlotsForMeeting, participants, slotLabel, withAvailability, withMeetings, withMeetingSlot, type Asked, type Project } from '../lib/project'
import { assignCell, assignEffect, indexMeetings, isRefused, meetingAt, otherSide, pairOf, type AssignEffect, type Id, type Side } from '../lib/scheduler'
import { Button, Name, RequestMark, type UpdateProject } from './ui'
import { sideStyle, useNames, type Names, type ParticipantName } from './useNames'

/** A board cell: one slot for one participant on the `side` shown down the left. */
export interface Cell {
  slot: Id
  side: Side
  anchor: Id
}

/** Someone who could be booked into the cell. */
interface Candidate {
  who: ParticipantName
  asked: Asked
  effect: AssignEffect
  booked: number
}

/** Both asked > decision maker asked > team asked > nobody. */
const strength = ({ dm, team }: Asked) => (dm ? 2 : 0) + (team ? 1 : 0)

/** The selected cell: who is there, and everyone who could be, with what picking them would do. */
export function Inspector({ project, cell, onChange, onClose, onSelectSlot, onUndo, onRedo, canUndo, canRedo }: {
  project: Project; cell: Cell; onChange: UpdateProject; onClose: () => void; onSelectSlot: (slot: Id) => void
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean
}) {
  const [query, setQuery] = useState('')
  const [choice, setChoice] = useState<Id | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [notice, setNotice] = useState('')
  const preview = useRef<HTMLDivElement>(null)
  useEffect(() => { if (choice) { preview.current?.focus(); preview.current?.scrollIntoView({ block: 'nearest' }) } }, [choice])
  const { slot, side, anchor } = cell
  const other = otherSide(side)
  const names = useNames(project)
  const available = availabilityOfProject(project)
  const time = slotLabel(project, slot)
  const meeting = meetingAt(indexMeetings(project.meetings), side, slot, anchor)

  const booked = new Map<Id, number>()
  for (const m of project.meetings) booked.set(m[other], (booked.get(m[other]) ?? 0) + 1)
  const candidates: Candidate[] = participants(project, other)
    .filter((p) => p.id !== meeting?.[other])
    .map((p) => ({
      who: names(p.id),
      asked: asksFor(project, pairOf(side, anchor, p.id)),
      effect: assignEffect(project.meetings, slot, side, anchor, p.id, available),
      booked: booked.get(p.id) ?? 0,
    }))
    .sort((a, b) => strength(b.asked) - strength(a.asked) || a.who.name.localeCompare(b.who.name))
  const listed = candidates.filter((c) => c.who.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const picked = candidates.find((c) => c.who.id === choice)
  const freeSlots = meeting ? freeSlotsForMeeting(project, meeting) : []

  const book = (id: Id | null) => {
    onChange((p) => withMeetings(p, assignCell(p.meetings, slot, side, anchor, id, availabilityOfProject(p))))
    setChoice(null)
    setMoveTo('')
    setNotice(id ? 'Meeting updated. Only the changes shown in the preview were applied.' : 'Meeting removed. Both people are free here; all other meetings are unchanged.')
  }
  const setAvailable = (ok: boolean) => {
    onChange((p) => withAvailability(p, anchor, slot, ok))
    setChoice(null)
    setNotice(ok ? 'Available again. No meeting has been added.' : 'Marked unavailable for this slot. Any meeting here was removed; other meetings are unchanged.')
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-paper">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule bg-canvas p-4">
        <div className="min-w-0">
          <h2 id="meeting-editor-title" className="text-lg font-bold">Edit meeting</h2>
          <div className={`break-words font-semibold ${sideStyle[side]}`}>{names(anchor).name}</div>
        </div>
        <Button onClick={onClose} aria-label="Close meeting editor">
          Done ✕
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <label className="block font-semibold">Time slot
        <select value={slot} onChange={(e) => onSelectSlot(e.target.value)} className="mt-1 block w-full rounded border border-rule bg-paper p-2 font-normal">
          {project.slots.map((s) => <option key={s.id} value={s.id}>{slotLabel(project, s.id)}</option>)}
        </select>
      </label>
      <p role="status" className="text-accent">{notice}</p>

      {!available(anchor, slot) ? (
        <div className="space-y-3 rounded border border-rule bg-canvas p-3">
          <div>
            <div className="font-semibold">Not available at {time}</div>
            <div className="text-muted">No meeting is booked here.</div>
          </div>
          <Button onClick={() => setAvailable(true)}>Available again</Button>
        </div>
      ) : (
        <>
          <div className="rounded border border-rule bg-canvas p-3">
            {meeting ? <Meets who={names(meeting[other])} asked={asksFor(project, meeting)} onRemove={() => book(null)} /> : <div><h3 className="font-bold">Empty slot</h3><p className="text-muted">Leave it empty, or choose someone below to book a meeting.</p></div>}
          </div>

          {meeting && <details className="rounded border border-rule p-3">
            <summary className="cursor-pointer font-semibold">Move this meeting to another time</summary>
            <p className="my-2 text-muted">Only times when both people are free and available are listed. Other meetings stay put.</p>
            {freeSlots.length ? <>
              <label className="block">New time
                <select className="my-2 block w-full rounded border border-rule bg-paper p-2" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose a time…</option>
                  {freeSlots.map((s) => <option key={s.id} value={s.id}>{slotLabel(project, s.id)}</option>)}
                </select>
              </label>
              <Button disabled={!freeSlots.some((s) => s.id === moveTo)} onClick={() => { onChange((p) => withMeetingSlot(p, meeting, moveTo)); onSelectSlot(moveTo) }}>Move meeting</Button>
            </> : <p className="text-muted">No other time is free for both people. Remove or move a conflicting meeting first.</p>}
          </details>}

          <div>
            <h3 className="mb-2 font-bold">{meeting ? 'Replace with someone else' : 'Add a meeting'}</h3>
            <label className="block">Search {other === 'team' ? 'film teams' : 'decision makers'}
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="my-2 block w-full rounded border border-rule bg-paper p-2" placeholder="Type a name…" />
            </label>
            <p className="mb-2 text-muted">All participants are shown, requested or not. Choose one to preview the change.</p>
            {picked && <div ref={preview} tabIndex={-1} aria-label="Change preview" className="my-3 space-y-2 rounded border border-accent bg-canvas p-3">
              <h4 className="font-bold">Preview — {names(anchor).name} meets {picked.who.name}</h4>
              <p><Effect effect={picked.effect} names={names} other={other} project={project} /></p>
              {meeting && picked.effect.kind === 'free' && <p>{names(meeting[other]).name} will be free at {time}.</p>}
              <p className="text-muted">{askedBy(picked.asked)} · No other time slots change.</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isRefused(picked.effect)} onClick={() => book(picked.who.id)}>{picked.effect.kind === 'swap' ? 'Apply swap' : meeting ? 'Replace meeting' : 'Book meeting'}</Button>
                <Button variant="quiet" onClick={() => setChoice(null)}>Cancel selection</Button>
              </div>
            </div>}
            <CandidateList candidates={listed} names={names} other={other} project={project} onPick={setChoice} selected={choice} />
          </div>

          <div className="border-t border-rule pt-3">
            <p className="mb-2 text-muted">Need a break or away at this time? Blocking the slot also keeps it empty on rebuild.</p>
            <Button onClick={() => setAvailable(false)} title="Blocks this slot; any meeting here is removed">
              Mark unavailable at {time}
            </Button>
          </div>
        </>
      )}
      <p className="text-muted">Edits apply immediately when confirmed. Removing a meeting leaves a gap; a later rebuild may fill it again.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-rule bg-canvas p-3">
        <Button disabled={!canUndo} onClick={() => { onUndo(); setChoice(null); setNotice('Last change undone.') }}>Undo</Button>
        <Button disabled={!canRedo} onClick={() => { onRedo(); setChoice(null); setNotice('Change redone.') }}>Redo</Button>
        <span className="text-muted">No automatic rebuilding</span>
      </div>
    </aside>
  )
}

function Meets({ who, asked, onRemove }: { who: ParticipantName; asked: Asked; onRemove: () => void }) {
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <div className="eyebrow">Meets</div>
        <Name who={who} variant="full" className="text-base font-semibold" />
        <div className="flex items-center gap-1.5 text-muted">
          <RequestMark {...asked} /> {askedBy(asked)}
        </div>
      </div>
      <Button onClick={onRemove} title="Remove only this meeting; leave both people free">
        Remove meeting
      </Button>
      <p className="text-muted">Leaves this slot empty. All other meetings stay where they are.</p>
    </div>
  )
}

function CandidateList({
  candidates,
  names,
  other,
  project,
  onPick,
  selected,
}: {
  candidates: Candidate[]
  names: Names
  other: Side
  project: Project
  onPick: (id: Id) => void
  selected: Id | null
}) {
  if (!candidates.length) return <p className="py-2 text-muted">No matching participants.</p>
  return (
    <ul className="divide-y divide-rule">
      {candidates.map((c) => (
        <li key={c.who.id}>
          <button
            type="button"
            disabled={isRefused(c.effect)}
            aria-pressed={selected === c.who.id}
            onClick={() => onPick(c.who.id)}
            className={`flex w-full cursor-pointer items-center justify-between gap-2 px-1 py-3 text-left hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 ${selected === c.who.id ? 'bg-canvas outline outline-accent' : ''}`}
          >
            <span className="min-w-0">
              <Name who={c.who} variant="full" className="font-semibold" />
              <span className="block text-muted">
                <Effect effect={c.effect} names={names} other={other} project={project} /> · {c.booked}/{project.slots.length} booked
              </span>
            </span>
            <RequestMark {...c.asked} />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One line on what picking a candidate does to the rest of the board. `other` is the candidates' side. */
function Effect({ effect, names, other, project }: { effect: AssignEffect; names: Names; other: Side; project: Project }): ReactNode {
  switch (effect.kind) {
    case 'free':
      return 'Free at this time — no other meeting needs to move.'
    case 'move':
      return (
        <>
          moves from <Code who={names(effect.displaced)} />{' '}
          <span className="text-warn">
            · leaves <Code who={names(effect.displaced)} /> free
          </span>
        </>
      )
    case 'swap':
      return (
        <>
          swap · <Code who={names(effect.displaced)} /> gets <Code who={names(effect.second[other])} /> <RequestMark {...asksFor(project, effect.second)} />
        </>
      )
    case 'repeat':
      return <>Would repeat {names(effect.team).name} / {names(effect.dm).name}, already meeting at {slotLabel(project, effect.at)}.</>
    case 'unavailable':
      return <>{names(effect.who).name} is unavailable at this time.</>
    default:
      return null
  }
}

/** Full names make the effects of a swap explicit. */
function Code({ who }: { who: ParticipantName }) {
  return <span className={sideStyle[who.side]}>{who.name}</span>
}
