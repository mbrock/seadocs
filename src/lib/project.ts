// The project model: everything the organiser has entered, plus the board.
// All functions return a new project; nothing here mutates its input.
//
// Participants and slots have stable ids so that renaming the lists,
// reordering them, or deleting one entry never shifts everybody else's
// interest scores or meetings around. Ids come from one counter per project.

import { MAX_SCORE, pairKey, type Id, type Participant, type PlacedMeeting, type Scores, type Slot } from './scheduler'

export const MAX_SLOTS = 60

export type ScoreKind = 'dm' | 'team'

export interface Project {
  teams: Participant[]
  dms: Participant[]
  /** In time order. Labels may be empty; slotLabel() fills them in. */
  slots: Slot[]
  dmScores: Scores
  teamScores: Scores
  meetings: PlacedMeeting[]
  /** Every team should get at least this many meetings (an objective, not a hard rule). */
  teamFloor: number
  nextId: number
}

export function emptyProject(): Project {
  return withSlotCount(
    {
      teams: [],
      dms: [],
      slots: [],
      dmScores: {},
      teamScores: {},
      meetings: [],
      teamFloor: 1,
      nextId: 1,
    },
    10,
  )
}

/** One name per line, trimmed, blanks and duplicates dropped. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const name = raw.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
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

export function participantName(project: Project, id: Id): string {
  const p = project.teams.find((t) => t.id === id) ?? project.dms.find((d) => d.id === id)
  return p ? p.name : id
}

/** Replace the participant lists, keeping ids (and so scores) for names that still exist. */
export function withParticipants(project: Project, teamNames: string[], dmNames: string[]): Project {
  const counter = { next: project.nextId }
  const teams = reconcile(project.teams, teamNames, 't', counter)
  const dms = reconcile(project.dms, dmNames, 'd', counter)
  return prune({ ...project, teams, dms, nextId: counter.next })
}

function reconcile(existing: Participant[], names: string[], prefix: string, counter: { next: number }): Participant[] {
  const byName = new Map(existing.map((p) => [p.name, p]))
  return names.map((name) => byName.get(name) ?? { id: `${prefix}${counter.next++}`, name })
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

export function withSlots(project: Project, count: number | string, labels: string[]): Project {
  return withSlotLabels(withSlotCount(project, count), labels)
}

export function withTeamFloor(project: Project, teamFloor: number | string): Project {
  return { ...project, teamFloor: cleanFloor(teamFloor) }
}

export function cleanFloor(x: unknown): number {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_SLOTS) : 1
}

/** Drop scores and meetings that refer to participants or slots that no longer exist. */
export function prune(project: Project): Project {
  const teamIds = new Set(project.teams.map((t) => t.id))
  const dmIds = new Set(project.dms.map((d) => d.id))
  const slotIds = new Set(project.slots.map((s) => s.id))
  const keep = (scores: Scores): Scores =>
    Object.fromEntries(
      Object.entries(scores).filter(([k, v]) => {
        const [t, d] = k.split('|')
        return v > 0 && teamIds.has(t) && dmIds.has(d)
      }),
    )
  const meetings = project.meetings.filter((m) => teamIds.has(m.team) && dmIds.has(m.dm) && slotIds.has(m.slot))
  return { ...project, dmScores: keep(project.dmScores), teamScores: keep(project.teamScores), meetings }
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
