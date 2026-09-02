// Scheduling logic. Pure functions, no DOM.
//
// Generating a schedule is two separate steps:
//   1. selectMeetings — decide WHICH pairs meet, respecting the per-person cap
//      (one meeting per slot means at most `slots.length` meetings each).
//   2. assignSlots    — decide WHEN, so nobody is double-booked. Because the
//      graph of teams × decision makers is bipartite, König's edge-colouring
//      theorem guarantees that any selection respecting the cap can always be
//      fitted into the available slots. So step 1 never has to worry about time.
//
// Slots are entities with stable ids, like participants, so that meetings and
// (later) per-slot availability survive inserting or removing a slot. The
// algorithms need the slot ORDER, so they take the ordered `Slot[]` and work
// with indices internally.

export type Id = string

export interface Participant {
  id: Id
  name: string
  /** Joins by video rather than in the room. Informational for now. */
  online?: boolean
}

/** 0 = none, 1 = interested, 2 = priority, 3 = must-meet */
export type Score = 0 | 1 | 2 | 3

/** pairKey(team, dm) -> score. Zero scores are simply absent. */
export type Scores = Record<string, number>

export interface Meeting {
  team: Id
  dm: Id
}

/** A time slot. Order is given by position in the project's slot list. */
export interface Slot {
  id: Id
  label: string
}

export interface PlacedMeeting extends Meeting {
  slot: Id
}

export interface Pair extends Meeting {
  ti: number
  di: number
  dmScore: number
  teamScore: number
}

export interface ScheduleInput {
  teams: Participant[]
  dms: Participant[]
  dmScores: Scores
  teamScores: Scores
  slots: Slot[]
}

export const MAX_SCORE = 3
export const SCORE_LABELS = ['none', 'interested', 'priority', 'must-meet'] as const

export function pairKey(teamId: Id, dmId: Id): string {
  return `${teamId}|${dmId}`
}

export function scoreOf(scores: Scores, teamId: Id, dmId: Id): number {
  return scores[pairKey(teamId, dmId)] || 0
}

/** Slot id -> position, for algorithms that reason about order. */
export function slotIndex(slots: Slot[]): Map<Id, number> {
  return new Map(slots.map((s, i) => [s.id, i]))
}

/** Every team × dm pair with both scores attached, in list order. */
export function allPairs({ teams, dms, dmScores, teamScores }: Omit<ScheduleInput, 'slots'>): Pair[] {
  const pairs: Pair[] = []
  teams.forEach((t, ti) => {
    dms.forEach((d, di) => {
      pairs.push({
        team: t.id,
        dm: d.id,
        ti,
        di,
        dmScore: scoreOf(dmScores, t.id, d.id),
        teamScore: scoreOf(teamScores, t.id, d.id),
      })
    })
  })
  return pairs
}

/** Higher rank = should be scheduled first. DM interest dominates, team interest breaks ties. */
export function rankOf(pair: Pair): number {
  return pair.dmScore * (MAX_SCORE + 1) + pair.teamScore
}

/**
 * Decide which meetings should happen.
 *
 * Requested pairs (either side scored > 0) are taken in tiers of descending
 * rank. Within a tier, the pair whose team (then dm) has the fewest meetings
 * so far is taken first, so equal interest is spread fairly instead of by
 * list order. A pair is skipped once either participant already has as many
 * meetings as there are slots.
 *
 * With `fillGaps`, pairs nobody asked for are added afterwards, again favouring
 * participants with the fewest meetings, until no more fit.
 *
 * Deterministic: the same input always gives the same selection. Greedy, so
 * not guaranteed optimal.
 */
export function selectMeetings(input: ScheduleInput & { fillGaps?: boolean }): Meeting[] {
  const { fillGaps = false } = input
  const slotCount = input.slots.length
  const load = new Map<Id, number>()
  const loadOf = (id: Id) => load.get(id) || 0
  const isFull = (p: Pair) => loadOf(p.team) >= slotCount || loadOf(p.dm) >= slotCount
  const compareLoad = (a: Pair, b: Pair) =>
    loadOf(a.team) - loadOf(b.team) || loadOf(a.dm) - loadOf(b.dm) || a.ti - b.ti || a.di - b.di
  const chosen: Meeting[] = []

  const tiers = new Map<number, Pair[]>()
  for (const p of allPairs(input)) {
    const rank = rankOf(p)
    if (!tiers.has(rank)) tiers.set(rank, [])
    tiers.get(rank)!.push(p)
  }
  const ranks = [...tiers.keys()].filter((r) => r > 0 || fillGaps).sort((a, b) => b - a)

  for (const rank of ranks) {
    const pending = tiers.get(rank)!.filter((p) => !isFull(p))
    while (pending.length) {
      let best = 0
      for (let i = 1; i < pending.length; i++) {
        if (compareLoad(pending[i], pending[best]) < 0) best = i
      }
      const [p] = pending.splice(best, 1)
      if (isFull(p)) continue
      chosen.push({ team: p.team, dm: p.dm })
      load.set(p.team, loadOf(p.team) + 1)
      load.set(p.dm, loadOf(p.dm) + 1)
    }
  }
  return chosen
}

/**
 * Give every meeting a slot so that no participant has two meetings in the
 * same slot. Bipartite edge colouring with one colour per slot: succeeds for
 * any input where nobody has more meetings than slots. Throws otherwise.
 *
 * Meetings are processed in order and take the earliest slot free for both
 * sides when possible, so higher-priority meetings tend to land earlier.
 */
export function assignSlots(meetings: Meeting[], slots: Slot[]): PlacedMeeting[] {
  const slotCount = slots.length
  const bySlot = new Map<string, Map<number, Placement>>()
  const at = (node: string) => {
    let m = bySlot.get(node)
    if (!m) bySlot.set(node, (m = new Map()))
    return m
  }
  const teamNode = (m: Meeting) => 't:' + m.team
  const dmNode = (m: Meeting) => 'd:' + m.dm
  const otherEnd = (m: Meeting, node: string) => (node === teamNode(m) ? dmNode(m) : teamNode(m))
  const freeSlot = (node: string) => {
    const used = at(node)
    for (let s = 0; s < slotCount; s++) if (!used.has(s)) return s
    return -1
  }
  const place = (m: Placement, slot: number) => {
    m.slot = slot
    at(teamNode(m)).set(slot, m)
    at(dmNode(m)).set(slot, m)
  }
  const unplace = (m: Placement) => {
    at(teamNode(m)).delete(m.slot)
    at(dmNode(m)).delete(m.slot)
  }

  const placed: Placement[] = meetings.map((m) => ({ team: m.team, dm: m.dm, slot: -1 }))
  for (const m of placed) {
    const u = teamNode(m)
    const v = dmNode(m)
    const a = freeSlot(u)
    const b = freeSlot(v)
    if (a < 0) throw new Error(`Team ${m.team} has more than ${slotCount} meetings`)
    if (b < 0) throw new Error(`Decision maker ${m.dm} has more than ${slotCount} meetings`)
    if (!at(v).has(a)) {
      place(m, a)
      continue
    }
    // Slot a is free for the team but taken for the dm. Follow the chain of
    // meetings from the dm that alternate slot a, b, a, b… and swap them. In a
    // bipartite graph this chain can never reach the team (it would have to
    // arrive via slot a, which the team has free), so afterwards a is free for
    // both sides.
    const path: Placement[] = []
    let node = v
    let slot = a
    for (;;) {
      const e = at(node).get(slot)
      if (!e) break
      path.push(e)
      node = otherEnd(e, node)
      slot = slot === a ? b : a
    }
    for (const e of path) unplace(e)
    for (const e of path) place(e, e.slot === a ? b : a)
    place(m, a)
  }
  return placed.map((m) => ({ team: m.team, dm: m.dm, slot: slots[m.slot].id }))
}

/** A meeting at a slot POSITION; only used while colouring. */
interface Placement extends Meeting {
  slot: number
}

/** Select and place in one go. */
export function buildSchedule(input: ScheduleInput, { fillGaps = false } = {}): PlacedMeeting[] {
  return assignSlots(selectMeetings({ ...input, fillGaps }), input.slots)
}

export type Side = 'team' | 'dm'
const otherSide = (side: Side): Side => (side === 'team' ? 'dm' : 'team')

/**
 * Change who `anchor` (a team or a dm, per `side`) meets in `slot`. `partner
 * === null` frees the cell. If the partner is already booked with someone else
 * in that slot, the two meetings swap partners. Returns a new meetings array.
 */
export function assignCell(meetings: PlacedMeeting[], slot: Id, side: Side, anchor: Id, partner: Id | null): PlacedMeeting[] {
  const other = otherSide(side)
  const current = meetings.find((m) => m.slot === slot && m[side] === anchor) ?? null
  const out = meetings.filter((m) => m !== current)
  if (partner === null) return out
  const clashIdx = out.findIndex((m) => m.slot === slot && m[other] === partner)
  if (clashIdx >= 0) {
    const clash = out[clashIdx]
    out.splice(clashIdx, 1)
    if (current) out.push({ ...clash, [other]: current[other] })
  }
  out.push(side === 'dm' ? { slot, dm: anchor, team: partner } : { slot, team: anchor, dm: partner })
  return out
}

/** assignCell anchored on a decision maker: change what happens at (slot, dm). */
export function reassign(meetings: PlacedMeeting[], slot: Id, dmId: Id, teamId: Id | null): PlacedMeeting[] {
  return assignCell(meetings, slot, 'dm', dmId, teamId)
}

export interface MeetingIndex {
  /** `${slot}|${dm}` -> meeting */
  byCell: Map<string, PlacedMeeting>
  /** `${slot}|${team}` -> meeting */
  byTeamSlot: Map<string, PlacedMeeting>
  /** pairKey -> meetings (more than one means a duplicate) */
  byPair: Map<string, PlacedMeeting[]>
}

/** Lookup structures derived from the meetings list. */
export function indexMeetings(meetings: PlacedMeeting[]): MeetingIndex {
  const byCell = new Map<string, PlacedMeeting>()
  const byTeamSlot = new Map<string, PlacedMeeting>()
  const byPair = new Map<string, PlacedMeeting[]>()
  for (const m of meetings) {
    byCell.set(`${m.slot}|${m.dm}`, m)
    byTeamSlot.set(`${m.slot}|${m.team}`, m)
    const k = pairKey(m.team, m.dm)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(m)
  }
  return { byCell, byTeamSlot, byPair }
}

export type Issue =
  | { type: 'duplicate'; team: Id; dm: Id; slots: [Id, Id] }
  | { type: 'team-clash'; team: Id; slot: Id }
  | { type: 'dm-clash'; dm: Id; slot: Id }

/**
 * Problems a generated schedule never has, but manual editing can introduce:
 * the same pair meeting twice, or someone booked twice in one slot.
 */
export function findIssues(meetings: PlacedMeeting[]): Issue[] {
  const issues: Issue[] = []
  const seenPair = new Map<string, Id>()
  const seenTeamSlot = new Set<string>()
  const seenDmSlot = new Set<string>()
  for (const m of meetings) {
    const k = pairKey(m.team, m.dm)
    if (seenPair.has(k)) issues.push({ type: 'duplicate', team: m.team, dm: m.dm, slots: [seenPair.get(k)!, m.slot] })
    else seenPair.set(k, m.slot)
    const ts = `${m.slot}|${m.team}`
    if (seenTeamSlot.has(ts)) issues.push({ type: 'team-clash', team: m.team, slot: m.slot })
    else seenTeamSlot.add(ts)
    const ds = `${m.slot}|${m.dm}`
    if (seenDmSlot.has(ds)) issues.push({ type: 'dm-clash', dm: m.dm, slot: m.slot })
    else seenDmSlot.add(ds)
  }
  return issues
}

export interface Stats {
  meetings: number
  capacity: number
  dmRequested: number
  dmSatisfied: number
  mustMeetRequested: number
  mustMeetSatisfied: number
  teamRequested: number
  teamSatisfied: number
  teamOnlyHonoured: number
  unrequestedPlaced: number
  teamsWithoutMeetings: number
  /** Requested pairs that did not get a meeting, strongest first. */
  unmet: Pair[]
}

export function computeStats(input: ScheduleInput, meetings: PlacedMeeting[]): Stats {
  const { byPair } = indexMeetings(meetings)
  const stats: Stats = {
    meetings: meetings.length,
    capacity: input.dms.length * input.slots.length,
    dmRequested: 0,
    dmSatisfied: 0,
    mustMeetRequested: 0,
    mustMeetSatisfied: 0,
    teamRequested: 0,
    teamSatisfied: 0,
    teamOnlyHonoured: 0,
    unrequestedPlaced: 0,
    teamsWithoutMeetings: 0,
    unmet: [],
  }
  for (const p of allPairs(input)) {
    const met = byPair.has(pairKey(p.team, p.dm))
    if (p.dmScore > 0) {
      stats.dmRequested++
      if (met) stats.dmSatisfied++
    }
    if (p.dmScore === MAX_SCORE) {
      stats.mustMeetRequested++
      if (met) stats.mustMeetSatisfied++
    }
    if (p.teamScore > 0) {
      stats.teamRequested++
      if (met) stats.teamSatisfied++
    }
    if (met && p.dmScore === 0 && p.teamScore > 0) stats.teamOnlyHonoured++
    if (met && p.dmScore === 0 && p.teamScore === 0) stats.unrequestedPlaced++
    if (!met && rankOf(p) > 0) stats.unmet.push(p)
  }
  stats.unmet.sort((a, b) => rankOf(b) - rankOf(a) || a.di - b.di || a.ti - b.ti)
  const teamsMet = new Set(meetings.map((m) => m.team))
  stats.teamsWithoutMeetings = input.teams.filter((t) => !teamsMet.has(t.id)).length
  return stats
}
