// What makes one schedule better than another, as a vector of counts.
//
// Every dimension is an integer to minimise with a one-line meaning, so the
// user can read a row of numbers and understand exactly what is being traded.
// A schedule DOMINATES another when it is no worse on every dimension and
// strictly better on at least one; the FRONTIER is the set of schedules that
// nobody dominates. Different frontier points are genuinely different choices
// (e.g. "one more decision-maker wish granted" vs "two fewer idle windows"),
// which is why we show them all rather than picking by a hidden formula.

import { allPairs, MAX_SCORE, pairKey, slotIndex, type Id, type PlacedMeeting, type ScheduleInput, type Slot } from './scheduler'

export interface Objectives {
  /** Decision-maker must-meets (score 3) that did not get a meeting. */
  missedMust: number
  /** Decision-maker priority asks (score 2) that did not get a meeting. */
  missedPriority: number
  /** Decision-maker "interested" asks (score 1) that did not get a meeting. */
  missedInterested: number
  /** Teams with fewer than `teamFloor` meetings. */
  teamsShort: number
  /** Idle slots inside a decision maker's day (between their first and last meeting), summed. */
  dmGaps: number
  /** Team asks (any score) that did not get a meeting. */
  missedTeam: number
  /** Meetings that neither side asked for. */
  fillers: number
  /** Idle slots inside a team's day, summed. */
  teamGaps: number
}

export type ObjectiveKey = keyof Objectives

/**
 * In priority order: this is also the tie-break order used to pick a default.
 * Decision-maker asks come as tiers — a must-meet is worth any number of
 * priorities, a priority any number of "interested" — because that is what the
 * words mean to the people ticking the boxes.
 */
export const OBJECTIVES: { key: ObjectiveKey; label: string; hint: string }[] = [
  { key: 'missedMust', label: 'must-meets', hint: 'Decision-maker must-meets that got no meeting' },
  { key: 'missedPriority', label: 'priorities', hint: 'Decision-maker priority asks that got no meeting' },
  { key: 'missedInterested', label: 'interested', hint: 'Decision-maker "interested" asks that got no meeting' },
  { key: 'teamsShort', label: 'teams short', hint: 'Teams with fewer meetings than the minimum you set' },
  { key: 'dmGaps', label: 'DM windows', hint: 'Empty slots between a decision maker’s first and last meeting, added up over all decision makers' },
  { key: 'missedTeam', label: 'team asks', hint: 'Team asks that got no meeting' },
  { key: 'fillers', label: 'fillers', hint: 'Meetings nobody asked for' },
  { key: 'teamGaps', label: 'team windows', hint: 'Empty slots between a team’s first and last meeting, added up over all teams' },
]

/** Objectives that count missed asks; shown to users as met/requested. */
export const ASK_OBJECTIVES: Partial<Record<ObjectiveKey, (p: { dmScore: number; teamScore: number }) => boolean>> = {
  missedMust: (p) => p.dmScore === 3,
  missedPriority: (p) => p.dmScore === 2,
  missedInterested: (p) => p.dmScore === 1,
  missedTeam: (p) => p.teamScore > 0,
}

/** How many asks of each kind the input contains, so missed counts can be shown as met/requested. */
export function requestedCounts(input: Omit<ScheduleInput, 'slots'>): Partial<Record<ObjectiveKey, number>> {
  const out: Partial<Record<ObjectiveKey, number>> = {}
  const pairs = allPairs(input)
  for (const [key, test] of Object.entries(ASK_OBJECTIVES) as [ObjectiveKey, (p: { dmScore: number; teamScore: number }) => boolean][]) {
    out[key] = pairs.filter(test).length
  }
  return out
}

export interface ObjectiveInput extends ScheduleInput {
  /** Every team should get at least this many meetings. */
  teamFloor: number
}

/** Idle slots strictly inside each participant's day, summed. */
export function gapsOf(meetings: PlacedMeeting[], slots: Slot[], side: 'team' | 'dm'): number {
  const index = slotIndex(slots)
  const used = new Map<Id, number[]>()
  for (const m of meetings) {
    const id = m[side]
    if (!used.has(id)) used.set(id, [])
    used.get(id)!.push(index.get(m.slot)!)
  }
  let gaps = 0
  for (const s of used.values()) {
    const distinct = new Set(s)
    gaps += Math.max(...s) - Math.min(...s) + 1 - distinct.size
  }
  return gaps
}

export function measure(input: ObjectiveInput, meetings: PlacedMeeting[]): Objectives {
  const met = new Set(meetings.map((m) => pairKey(m.team, m.dm)))
  const perTeam = new Map<Id, number>()
  for (const m of meetings) perTeam.set(m.team, (perTeam.get(m.team) ?? 0) + 1)

  const o: Objectives = { missedMust: 0, missedPriority: 0, missedInterested: 0, teamsShort: 0, dmGaps: 0, missedTeam: 0, fillers: 0, teamGaps: 0 }
  for (const p of allPairs(input)) {
    if (met.has(pairKey(p.team, p.dm))) {
      if (p.dmScore === 0 && p.teamScore === 0) o.fillers++
    } else {
      if (p.dmScore === MAX_SCORE) o.missedMust++
      if (p.dmScore === 2) o.missedPriority++
      if (p.dmScore === 1) o.missedInterested++
      if (p.teamScore > 0) o.missedTeam++
    }
  }
  o.teamsShort = input.teams.filter((t) => (perTeam.get(t.id) ?? 0) < input.teamFloor).length
  o.dmGaps = gapsOf(meetings, input.slots, 'dm')
  o.teamGaps = gapsOf(meetings, input.slots, 'team')
  return o
}

/** True when `a` is at least as good everywhere and strictly better somewhere. */
export function dominates(a: Objectives, b: Objectives): boolean {
  let strict = false
  for (const { key } of OBJECTIVES) {
    if (a[key] > b[key]) return false
    if (a[key] < b[key]) strict = true
  }
  return strict
}

export function sameObjectives(a: Objectives, b: Objectives): boolean {
  return OBJECTIVES.every(({ key }) => a[key] === b[key])
}

/** Priority order: first dimension that differs decides. */
export function compareLex(a: Objectives, b: Objectives): number {
  for (const { key } of OBJECTIVES) if (a[key] !== b[key]) return a[key] - b[key]
  return 0
}

/**
 * Insert into a frontier: dropped if something already there dominates or
 * equals it; otherwise added, evicting whatever it dominates. Frontiers here
 * are small (a handful to a few dozen points), so the quadratic merge is fine.
 */
export function addToFrontier<T>(frontier: T[], item: T, objectives: (t: T) => Objectives): T[] {
  const o = objectives(item)
  for (const f of frontier) {
    const fo = objectives(f)
    if (dominates(fo, o) || sameObjectives(fo, o)) return frontier
  }
  return [...frontier.filter((f) => !dominates(o, objectives(f))), item]
}
