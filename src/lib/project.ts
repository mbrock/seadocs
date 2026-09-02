// The project model: everything the organiser has entered, plus the board.
// All functions return a new project; nothing here mutates its input.
//
// Participants and slots have stable ids so that renaming the lists,
// reordering them, or deleting one entry never shifts everybody else's
// interest scores or meetings around. Ids come from one counter per project.

import { availabilityOf, MAX_SCORE, pairKey, type Availability, type Id, type Participant, type PlacedMeeting, type Scores, type Slot } from './scheduler'

export const MAX_SLOTS = 60

export type ScoreKind = 'dm' | 'team'

export interface Project {
  /** Event and day, for printed running orders: "Baltic Sea Docs 2026 · Day 1, 10 September". */
  title: string
  teams: Participant[]
  dms: Participant[]
  /** In time order. Labels may be empty; slotLabel() fills them in. */
  slots: Slot[]
  dmScores: Scores
  teamScores: Scores
  meetings: PlacedMeeting[]
  nextId: number
}

export function emptyProject(): Project {
  return withSlotCount(
    {
      title: '',
      teams: [],
      dms: [],
      slots: [],
      dmScores: {},
      teamScores: {},
      meetings: [],
      nextId: 1,
    },
    10,
  )
}

/**
 * A participant as typed in the roster: a name, an optional ` = CODE` giving
 * the short form to use in dense tables, and a trailing `*` meaning "joins online".
 */
export interface RosterEntry {
  name: string
  online: boolean
  code?: string
}

/** One entry per line, trimmed, blanks and duplicate names dropped. */
export function parseRoster(text: string): RosterEntry[] {
  const seen = new Set<string>()
  const out: RosterEntry[] = []
  for (const raw of text.split('\n')) {
    let line = raw.trim()
    const online = line.endsWith('*')
    if (online) line = line.slice(0, -1).trim()
    const eq = line.lastIndexOf(' = ')
    const code = eq >= 0 ? line.slice(eq + 3).trim() : ''
    const name = (eq >= 0 ? line.slice(0, eq) : line).trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(code ? { name, online, code } : { name, online })
    }
  }
  return out
}

export function parseNames(text: string): string[] {
  return parseRoster(text).map((e) => e.name)
}

/** The roster text for a list of participants (inverse of parseRoster). */
export function rosterText(people: Participant[]): string {
  return people.map((p) => `${p.name}${p.code ? ` = ${p.code}` : ''}${p.online ? ' *' : ''}`).join('\n')
}

export function withTitle(project: Project, title: string): Project {
  return { ...project, title: title.trim() }
}

export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** The slot's own label, or "Slot n" by position. */
export function slotLabel(project: Project, slotId: Id): string {
  const i = project.slots.findIndex((s) => s.id === slotId)
  return project.slots[i]?.label || `Slot ${i + 1}`
}

/**
 * Where a decision maker sits: decision makers stay put and teams walk, so each
 * gets a table numbered by roster position; one joining online has none.
 */
export function tableLabel(project: Project, dmId: Id): string {
  const i = project.dms.findIndex((d) => d.id === dmId)
  if (i < 0) return ''
  return project.dms[i].online ? 'online' : `Table ${i + 1}`
}

export function participantName(project: Project, id: Id): string {
  const p = project.teams.find((t) => t.id === id) ?? project.dms.find((d) => d.id === id)
  return p ? p.name : id
}

/** Replace the participant lists, keeping ids (and so scores) for names that still exist. */
export function withParticipants(project: Project, teams: (RosterEntry | string)[], dms: (RosterEntry | string)[]): Project {
  const counter = { next: project.nextId }
  const entry = (e: RosterEntry | string): RosterEntry => (typeof e === 'string' ? { name: e, online: false } : e)
  return prune({
    ...project,
    teams: reconcile(project.teams, teams.map(entry), 't', counter),
    dms: reconcile(project.dms, dms.map(entry), 'd', counter),
    nextId: counter.next,
  })
}

function reconcile(existing: Participant[], entries: RosterEntry[], prefix: string, counter: { next: number }): Participant[] {
  const byName = new Map(existing.map((p) => [p.name, p]))
  return entries.map(({ name, online, code }) => {
    const old = byName.get(name)
    const id = old?.id ?? `${prefix}${counter.next++}`
    const p: Participant = { id, name }
    if (online) p.online = true
    if (code) p.code = code
    if (old?.unavailable?.length) p.unavailable = old.unavailable
    return p
  })
}

/**
 * Mark a participant as (un)available for a slot. Marking someone unavailable
 * removes whatever meeting they had then, since it can no longer happen.
 */
export function withAvailability(project: Project, id: Id, slotId: Id, available: boolean): Project {
  const update = (p: Participant): Participant => {
    if (p.id !== id) return p
    const rest = (p.unavailable ?? []).filter((s) => s !== slotId)
    const unavailable = available ? rest : [...rest, slotId]
    const { unavailable: _drop, ...clean } = p
    return unavailable.length ? { ...clean, unavailable } : clean
  }
  const meetings = available ? project.meetings : project.meetings.filter((m) => m.slot !== slotId || (m.team !== id && m.dm !== id))
  return { ...project, teams: project.teams.map(update), dms: project.dms.map(update), meetings }
}

export function availabilityOfProject(project: Pick<Project, 'teams' | 'dms'>): Availability {
  return availabilityOf([...project.teams, ...project.dms])
}

/** Keep the first `count` slots (and their meetings), appending fresh ones or dropping the tail. */
export function withSlotCount(project: Project, count: number | string): Project {
  const n = Math.min(MAX_SLOTS, Math.max(1, Math.floor(Number(count)) || 1))
  let next = project.nextId
  const slots = project.slots.slice(0, n)
  while (slots.length < n) slots.push({ id: `s${next++}`, label: '' })
  return prune({ ...project, slots, nextId: next })
}

/** Labels by position; missing ones become empty (so "Slot n" is shown). */
export function withSlotLabels(project: Project, labels: string[]): Project {
  return { ...project, slots: project.slots.map((s, i) => ({ ...s, label: labels[i] ?? '' })) }
}

/** One slot per label, in order, keeping the ids (and meetings) of the slots that stay. At least one slot. */
export function withSlots(project: Project, labels: string[]): Project {
  return withSlotLabels(withSlotCount(project, Math.max(1, labels.length)), labels)
}

/** Drop scores, meetings and availability marks that refer to participants or slots that no longer exist. */
export function prune(project: Project): Project {
  const teamIds = new Set(project.teams.map((t) => t.id))
  const dmIds = new Set(project.dms.map((d) => d.id))
  const slotIds = new Set(project.slots.map((s) => s.id))
  const keepSlots = (p: Participant): Participant => {
    if (!p.unavailable) return p
    const unavailable = p.unavailable.filter((s) => slotIds.has(s))
    if (unavailable.length === p.unavailable.length) return p
    const { unavailable: _drop, ...clean } = p
    return unavailable.length ? { ...clean, unavailable } : clean
  }
  const keep = (scores: Scores): Scores =>
    Object.fromEntries(
      Object.entries(scores).filter(([k, v]) => {
        const [t, d] = k.split('|')
        return v > 0 && teamIds.has(t) && dmIds.has(d)
      }),
    )
  const meetings = project.meetings.filter((m) => teamIds.has(m.team) && dmIds.has(m.dm) && slotIds.has(m.slot))
  return {
    ...project,
    teams: project.teams.map(keepSlots),
    dms: project.dms.map(keepSlots),
    dmScores: keep(project.dmScores),
    teamScores: keep(project.teamScores),
    meetings,
  }
}

export function withScore(project: Project, kind: ScoreKind, teamId: Id, dmId: Id, score: number): Project {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores'
  const scores = { ...project[field] }
  const k = pairKey(teamId, dmId)
  if (score > 0) scores[k] = score
  else delete scores[k]
  return { ...project, [field]: scores }
}

export function cycleScore(project: Project, kind: ScoreKind, teamId: Id, dmId: Id): Project {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores'
  const cur = project[field][pairKey(teamId, dmId)] || 0
  return withScore(project, kind, teamId, dmId, (cur + 1) % (MAX_SCORE + 1))
}

export function withScores(project: Project, dmScores: Scores, teamScores: Scores): Project {
  return prune({ ...project, dmScores, teamScores })
}

export function withMeetings(project: Project, meetings: PlacedMeeting[]): Project {
  return { ...project, meetings }
}
