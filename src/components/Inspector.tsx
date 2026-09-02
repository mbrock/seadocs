import type { ReactNode } from 'react'
import { askedBy } from '../lib/describe'
import { asksFor, availabilityOfProject, participants, slotLabel, withAvailability, withMeetings, type Asked, type Project } from '../lib/project'
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
export function Inspector({ project, cell, onChange, onClose }: { project: Project; cell: Cell; onChange: UpdateProject; onClose: () => void }) {
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
  const listed = candidates.filter((c) => !isRefused(c.effect))
  const requested = listed.filter((c) => strength(c.asked) > 0)
  const unrequested = listed.filter((c) => strength(c.asked) === 0)
  const alreadyMet = candidates.filter((c) => c.effect.kind === 'repeat').length
  const away = candidates.filter((c) => c.effect.kind === 'unavailable').length

  const book = (id: Id | null) => onChange((p) => withMeetings(p, assignCell(p.meetings, slot, side, anchor, id, availabilityOfProject(p))))
  const setAvailable = (ok: boolean) => onChange((p) => withAvailability(p, anchor, slot, ok))
  const list = (rows: Candidate[]) => <CandidateList candidates={rows} names={names} other={other} project={project} onPick={book} />

  return (
    <aside className="flex flex-col rounded-[4px] border border-rule bg-paper">
      <div className="flex items-start justify-between gap-2 border-b border-rule px-2 py-1.5">
        <div className="min-w-0">
          <div className="eyebrow">{time}</div>
          <div className={`truncate font-bold ${sideStyle[side]}`}>{names(anchor).name}</div>
        </div>
        <Button variant="quiet" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      {!available(anchor, slot) ? (
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div>
            <div className="font-semibold">Not available at {time}</div>
            <div className="text-muted">No meeting is booked here.</div>
          </div>
          <Button onClick={() => setAvailable(true)}>Available again</Button>
        </div>
      ) : (
        <>
          <div className="border-b border-rule px-2 py-1.5">
            {meeting ? <Meets who={names(meeting[other])} asked={asksFor(project, meeting)} onRemove={() => book(null)} /> : <div className="text-muted">Free</div>}
          </div>

          <div className="px-2 py-1.5">
            <div className="eyebrow mb-1">{meeting ? 'Replace with' : 'Book'}</div>
            {list(requested)}
            {unrequested.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-muted">{unrequested.length} nobody asked for</summary>
                {list(unrequested)}
              </details>
            )}
            {(alreadyMet > 0 || away > 0) && (
              <p className="mt-2 text-muted">
                Not listed:{' '}
                {alreadyMet > 0 && (
                  <>
                    {alreadyMet} already meet <Code who={names(anchor)} /> today
                  </>
                )}
                {alreadyMet > 0 && away > 0 && ' · '}
                {away > 0 && `${away} not available at ${time}`}
              </p>
            )}
          </div>

          <div className="border-t border-rule px-2 py-1">
            <Button variant="quiet" onClick={() => setAvailable(false)} title="Blocks this slot; any meeting here is removed">
              <Code who={names(anchor)} /> can't do {time}
            </Button>
          </div>
        </>
      )}
    </aside>
  )
}

function Meets({ who, asked, onRemove }: { who: ParticipantName; asked: Asked; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="eyebrow">Meets</div>
        <Name who={who} variant="short" className="font-semibold" />
        <div className="flex items-center gap-1.5 text-muted">
          <RequestMark {...asked} /> {askedBy(asked)}
        </div>
      </div>
      <Button onClick={onRemove} title="Take this meeting off the board">
        Remove
      </Button>
    </div>
  )
}

function CandidateList({
  candidates,
  names,
  other,
  project,
  onPick,
}: {
  candidates: Candidate[]
  names: Names
  other: Side
  project: Project
  onPick: (id: Id) => void
}) {
  if (!candidates.length) return <p className="py-1 text-muted">Nobody.</p>
  return (
    <ul className="divide-y divide-rule">
      {candidates.map((c) => (
        <li key={c.who.id}>
          <button
            type="button"
            onClick={() => onPick(c.who.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 py-1 text-left hover:bg-canvas"
          >
            <span className="min-w-0">
              <Name who={c.who} variant="short" className="font-semibold" />
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
      return 'free now'
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
    default:
      return null
  }
}

/** A name in running text: the board code, italic for teams. */
function Code({ who }: { who: ParticipantName }) {
  return <span className={sideStyle[who.side]}>{who.code}</span>
}
