// What makes one schedule better than another, as a vector of counts.
//
// Every dimension is an integer to minimise with a one-line meaning, so the
// user can read a row of numbers and understand exactly what is being traded.
// A schedule DOMINATES another when it is no worse on every dimension and
// strictly better on at least one; the FRONTIER is the set of schedules that
// nobody dominates. Different frontier points are genuinely different choices
// (e.g. "one more decision-maker wish granted" vs "two fewer idle windows"),
// which is why we show them all rather than picking by a hidden formula.

import { allPairs, availabilityOf, pairKey, slotIndex, type Availability, type Id, type PlacedMeeting, type ScheduleInput, type Slot } from './scheduler'

export interface Objectives {
  /** Decision-maker asks that did not get a meeting. */
  missedDm: number
  /** Decision makers who got fewer than half of the meetings they asked for. */
  dmsUnderHalf: number
  /** Teams that got no meeting at all. */
  teamsEmpty: number
  /** Idle slots inside a decision maker's day (between their first and last meeting) that they could have used, summed. */
  dmGaps: number
  /** Team asks that did not get a meeting. */
  missedTeam: number
  /** Slots a decision maker could do but sits out, summed. Everyone is there to meet, so an empty seat is a loss even when nobody asked for it. */
  dmIdle: number
  /** Idle slots inside a team's day, summed. */
  teamGaps: number
}

export type ObjectiveKey = keyof Objectives

/**
 * In priority order: this is also the tie-break order used to pick a default.
 * Decision-maker asks come first because the decision makers are the guests
 * whose time the day is organised around; team asks are heard once every
 * decision maker has been served as well as possible. Everyone is at the
 * event to meet, so a full room outranks a tidy one: empty seats count
 * before windows.
 */
export const OBJECTIVES: { key: ObjectiveKey; label: string; hint: string }[] = [
  { key: 'missedDm', label: 'DM asks', hint: 'Decision-maker asks that got no meeting' },
  { key: 'dmsUnderHalf', label: 'DMs under half', hint: 'Decision makers who got fewer than half of the meetings they asked for' },
  { key: 'teamsEmpty', label: 'teams left out', hint: 'Teams with no meeting at all' },
  { key: 'missedTeam', label: 'team asks', hint: 'Team asks that got no meeting' },
  { key: 'dmIdle', label: 'empty seats', hint: 'Slots a decision maker could do but has no meeting in, added up over all decision makers' },
  { key: 'dmGaps', label: 'DM windows', hint: 'Empty slots between a decision maker’s first and last meeting, added up over all decision makers' },
  { key: 'teamGaps', label: 'team windows', hint: 'Empty slots between a team’s first and last meeting, added up over all teams' },
]

/** Objectives that count missed asks; shown to users as met/requested. */
export const ASK_OBJECTIVES: Partial<Record<ObjectiveKey, (p: { dmAsked: boolean; teamAsked: boolean }) => boolean>> = {
  missedDm: (p) => p.dmAsked,
  missedTeam: (p) => p.teamAsked,
}

/** How many asks of each kind the input contains, so missed counts can be shown as met/requested. */
export function requestedCounts(input: Omit<ScheduleInput, 'slots'>): Partial<Record<ObjectiveKey, number>> {
  const out: Partial<Record<ObjectiveKey, number>> = {}
  const pairs = allPairs(input)
  for (const [key, test] of Object.entries(ASK_OBJECTIVES) as [ObjectiveKey, (p: { dmAsked: boolean; teamAsked: boolean }) => boolean][]) {
    out[key] = pairs.filter(test).length
  }
  return out
}

/**
 * Idle slots strictly inside each participant's day, summed. A slot they are
 * unavailable for is not idle time, so it is not counted.
 */
export function gapsOf(meetings: PlacedMeeting[], slots: Slot[], side: 'team' | 'dm', available: Availability = () => true): number {
  const index = slotIndex(slots)
  const used = new Map<Id, Set<number>>()
  for (const m of meetings) {
    const id = m[side]
    if (!used.has(id)) used.set(id, new Set())
    used.get(id)!.add(index.get(m.slot)!)
  }
  let gaps = 0
  for (const [id, s] of used) {
    const lo = Math.min(...s)
    const hi = Math.max(...s)
    for (let i = lo + 1; i < hi; i++) if (!s.has(i) && available(id, slots[i].id)) gaps++
  }
  return gaps
}

export function measure(input: ScheduleInput, meetings: PlacedMeeting[]): Objectives {
  const met = new Set(meetings.map((m) => pairKey(m.team, m.dm)))
  const teamsMet = new Set(meetings.map((m) => m.team))
  const available = availabilityOf([...input.teams, ...input.dms])

  const o: Objectives = { missedDm: 0, dmsUnderHalf: 0, teamsEmpty: 0, dmGaps: 0, missedTeam: 0, dmIdle: 0, teamGaps: 0 }
  const asked = new Map<Id, [number, number]>()
  for (const p of allPairs(input)) {
    const got = met.has(pairKey(p.team, p.dm))
    if (p.dmAsked) {
      const a = asked.get(p.dm) ?? [0, 0]
      a[0]++
      if (got) a[1]++
      asked.set(p.dm, a)
    }
    if (!got) {
      if (p.dmAsked) o.missedDm++
      if (p.teamAsked) o.missedTeam++
    }
  }
  for (const [n, k] of asked.values()) if (2 * k < n) o.dmsUnderHalf++
  o.teamsEmpty = input.teams.filter((t) => !teamsMet.has(t.id)).length
  const seats = input.dms.reduce((n, dm) => n + input.slots.filter((s) => available(dm.id, s.id)).length, 0)
  o.dmIdle = seats - meetings.length
  o.dmGaps = gapsOf(meetings, input.slots, 'dm', available)
  o.teamGaps = gapsOf(meetings, input.slots, 'team', available)
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
