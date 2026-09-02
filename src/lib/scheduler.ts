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
// per-slot availability survive inserting or removing a slot. The algorithms
// need the slot ORDER, so they take the ordered `Slot[]` and work with indices
// internally.
//
// Availability: a participant may be marked unavailable for some slots (an
// online guest in Tokyo cannot do the first two). Every function that places
// or moves meetings takes an `Availability` and never puts anyone into a slot
// they cannot do. With exceptions the König guarantee no longer holds, so
// `assignSlots` may leave a meeting out; it then simply counts as unmet.

export type Id = string

export interface Participant {
  id: Id
  name: string
  /** Joins by video rather than in the room. Informational for now. */
  online?: boolean
  /** Hand-picked short form for dense tables, overriding the derived one ("Europe"). */
  code?: string
  /** Slot ids this person cannot do. Absent = available all day. */
  unavailable?: Id[]
}

/** Can `id` be in a meeting at `slot`? */
export type Availability = (id: Id, slot: Id) => boolean

export const alwaysAvailable: Availability = () => true

export function availabilityOf(people: Participant[]): Availability {
  const blocked = new Map<Id, Set<Id>>()
  for (const p of people) if (p.unavailable?.length) blocked.set(p.id, new Set(p.unavailable))
  if (!blocked.size) return alwaysAvailable
  return (id, slot) => !blocked.get(id)?.has(slot)
}

/** How many slots each participant can do: their cap on meetings. */
export function availableCounts(people: Participant[], slots: Slot[]): Map<Id, number> {
  const ids = new Set(slots.map((s) => s.id))
  return new Map(people.map((p) => [p.id, slots.length - (p.unavailable ?? []).filter((s) => ids.has(s)).length]))
}

/**
 * The meetings one side asked for: pairKey(team, dm) -> true. Interest is
 * either/or — a decision maker either wants to meet a team or has not said so;
 * there are no grades. Not asked = absent.
 */
export type Asks = Record<string, true>

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
  /** The decision maker asked to meet this team. */
  dmAsked: boolean
  /** The team asked to meet this decision maker. */
  teamAsked: boolean
}

export interface ScheduleInput {
  teams: Participant[]
  dms: Participant[]
  dmAsks: Asks
  teamAsks: Asks
  slots: Slot[]
}

export function pairKey(teamId: Id, dmId: Id): string {
  return `${teamId}|${dmId}`
}

export function asked(asks: Asks, teamId: Id, dmId: Id): boolean {
  return pairKey(teamId, dmId) in asks
}

/** Slot id -> position, for algorithms that reason about order. */
export function slotIndex(slots: Slot[]): Map<Id, number> {
  return new Map(slots.map((s, i) => [s.id, i]))
}

/** Every team × dm pair with both sides' asks attached, in list order. */
export function allPairs({ teams, dms, dmAsks, teamAsks }: Omit<ScheduleInput, 'slots'>): Pair[] {
  const pairs: Pair[] = []
  teams.forEach((t, ti) => {
    dms.forEach((d, di) => {
      pairs.push({
        team: t.id,
        dm: d.id,
        ti,
        di,
        dmAsked: asked(dmAsks, t.id, d.id),
        teamAsked: asked(teamAsks, t.id, d.id),
      })
    })
  })
  return pairs
}

/**
 * Higher rank = should be scheduled first: 3 both asked, 2 only the decision
 * maker, 1 only the team, 0 nobody. Decision-maker interest dominates.
 */
export function rankOf(pair: Pair): number {
  return (pair.dmAsked ? 2 : 0) + (pair.teamAsked ? 1 : 0)
}

/**
 * Decide which meetings should happen.
 *
 * Requested pairs (either side asked) are taken in tiers of descending
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
  const cap = availableCounts([...input.teams, ...input.dms], input.slots)
  const load = new Map<Id, number>()
  const loadOf = (id: Id) => load.get(id) || 0
  const isFull = (p: Pair) => loadOf(p.team) >= (cap.get(p.team) ?? 0) || loadOf(p.dm) >= (cap.get(p.dm) ?? 0)
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
 * same slot, and nobody is put into a slot they cannot do. Bipartite edge
 * colouring with one colour per slot.
 *
 * Without availability exceptions this always succeeds when nobody has more
 * meetings than slots (König). With exceptions it may not: a meeting that
 * cannot be fitted is left out of the result, so callers see it as unmet.
 *
 * Each meeting takes the earliest slot free for both sides when there is one.
 * Otherwise it takes a slot `a` free for one side, and swaps `a` with a slot
 * `b` free for the other side along the chain of meetings alternating a, b,
 * a, b… (in a bipartite graph the chain never comes back to the meeting
 * itself). A swap that would move anyone into a slot they cannot do is not
 * taken; all (a, b) pairs from both sides are tried before giving up.
 * The most constrained meetings — the ones whose people can do the fewest
 * slots — are placed first.
 */
export function assignSlots(meetings: Meeting[], slots: Slot[], available: Availability = alwaysAvailable): PlacedMeeting[] {
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
  const can = (node: string, s: number) => available(node.slice(2), slots[s].id)
  const canMeet = (m: Meeting, s: number) => can(teamNode(m), s) && can(dmNode(m), s)
  const openSlots = (node: string) => {
    const used = at(node)
    const out: number[] = []
    for (let s = 0; s < slotCount; s++) if (!used.has(s) && can(node, s)) out.push(s)
    return out
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
  /** The chain of meetings from `node` alternating slots a, b, a, b… */
  const chain = (node: string, a: number, b: number) => {
    const path: Placement[] = []
    let slot = a
    for (;;) {
      const e = at(node).get(slot)
      if (!e) return path
      path.push(e)
      node = otherEnd(e, node)
      slot = slot === a ? b : a
    }
  }
  /** Swap a and b along the chain from `node`, if that leaves everyone in slots they can do. */
  const trySwap = (node: string, a: number, b: number) => {
    const path = chain(node, a, b)
    if (!path.every((e) => canMeet(e, e.slot === a ? b : a))) return false
    for (const e of path) unplace(e)
    for (const e of path) place(e, e.slot === a ? b : a)
    return true
  }

  const fewest = (m: Meeting) => Math.min(openSlots(teamNode(m)).length, openSlots(dmNode(m)).length)
  const pending: Placement[] = meetings
    .map((m, i) => ({ team: m.team, dm: m.dm, slot: -1, i, k: fewest(m) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
  const placed: Placement[] = []
  next: for (const m of pending) {
    const u = teamNode(m)
    const v = dmNode(m)
    const forTeam = openSlots(u)
    const forDm = openSlots(v)
    for (const a of forTeam) {
      if (!at(v).has(a) && can(v, a)) {
        place(m, a)
        placed.push(m)
        continue next
      }
    }
    for (const a of forTeam) {
      for (const b of forDm) {
        // a is free for the team but taken for the dm: swap a↔b along the dm's chain, then a is free for both.
        // Or the mirror image: b is free for the dm but taken for the team.
        if (at(v).has(a) && trySwap(v, a, b)) {
          place(m, a)
          placed.push(m)
          continue next
        }
        if (at(u).has(b) && trySwap(u, b, a)) {
          place(m, b)
          placed.push(m)
          continue next
        }
      }
    }
    // Nowhere to put it: left out.
  }
  placed.sort((x, y) => x.i - y.i)
  return placed.map((m) => ({ team: m.team, dm: m.dm, slot: slots[m.slot].id }))
}

/** A meeting at a slot POSITION; only used while colouring. */
interface Placement extends Meeting {
  slot: number
  /** Position in the input, so the output keeps the input order. */
  i: number
  /** How few slots its most constrained side has open when it was queued. */
  k: number
}

/** Select and place in one go. */
export function buildSchedule(input: ScheduleInput, { fillGaps = false } = {}): PlacedMeeting[] {
  return assignSlots(selectMeetings({ ...input, fillGaps }), input.slots, availabilityOf([...input.teams, ...input.dms]))
}

export type Side = 'team' | 'dm'
const otherSide = (side: Side): Side => (side === 'team' ? 'dm' : 'team')

/**
 * What putting `partner` into `anchor`'s cell at `slot` would do:
 *   clear   — the cell is emptied (partner null)
 *   free    — the partner is free then; one meeting is added (replacing the current one, if any)
 *   move    — the partner is with `displaced` then, and the cell is empty: their meeting moves here, `displaced` is left free
 *   swap    — the partner is with `displaced` then, and the cell is taken: the two meetings trade partners
 *   repeat  — the change would make some pair meet twice in the day; never applied
 *   unavailable — `who` cannot do this slot; never applied
 * A pair meeting twice is nonsense in this format (each seat a repeat takes is
 * a requested meeting that did not fit), so it is refused rather than flagged.
 */
export type AssignEffect =
  | { kind: 'clear' }
  | { kind: 'free' }
  | { kind: 'move'; displaced: Id }
  | { kind: 'swap'; displaced: Id; /** the pair the displaced person ends up in */ second: Meeting }
  | { kind: 'repeat'; team: Id; dm: Id; at: Id }
  | { kind: 'unavailable'; who: Id }

/** Effects that are refused rather than applied. */
export const isRefused = (e: AssignEffect) => e.kind === 'repeat' || e.kind === 'unavailable'

export function assignEffect(
  meetings: PlacedMeeting[],
  slot: Id,
  side: Side,
  anchor: Id,
  partner: Id | null,
  available: Availability = alwaysAvailable,
): AssignEffect {
  if (partner === null) return { kind: 'clear' }
  if (!available(anchor, slot)) return { kind: 'unavailable', who: anchor }
  if (!available(partner, slot)) return { kind: 'unavailable', who: partner }
  const other = otherSide(side)
  const pairOf = (a: Id, b: Id): Meeting => (side === 'dm' ? { dm: a, team: b } : { team: a, dm: b })
  const meetsElsewhere = (m: Meeting) => meetings.find((x) => x.team === m.team && x.dm === m.dm && x.slot !== slot)
  const wanted = pairOf(anchor, partner)
  const already = meetsElsewhere(wanted)
  if (already) return { kind: 'repeat', ...wanted, at: already.slot }
  const current = meetings.find((m) => m.slot === slot && m[side] === anchor) ?? null
  const busy = meetings.find((m) => m.slot === slot && m[other] === partner) ?? null
  if (!busy) return { kind: 'free' }
  const displaced = busy[side]
  if (!current) return { kind: 'move', displaced }
  const second = pairOf(displaced, current[other])
  const secondAlready = meetsElsewhere(second)
  if (secondAlready) return { kind: 'repeat', ...second, at: secondAlready.slot }
  return { kind: 'swap', displaced, second }
}

/**
 * Change who `anchor` (a team or a dm, per `side`) meets in `slot`, per
 * `assignEffect`. Returns a new meetings array; unchanged when the effect
 * would be a repeat.
 */
export function assignCell(
  meetings: PlacedMeeting[],
  slot: Id,
  side: Side,
  anchor: Id,
  partner: Id | null,
  available: Availability = alwaysAvailable,
): PlacedMeeting[] {
  const effect = assignEffect(meetings, slot, side, anchor, partner, available)
  if (isRefused(effect)) return meetings
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
  | { type: 'unavailable'; team: Id; dm: Id; slot: Id; who: Id }

/**
 * Problems neither generation nor the editor can produce, but a hand-written
 * or old project file might: the same pair meeting twice, someone booked
 * twice in one slot, or a meeting at a time one of them cannot do.
 */
export function findIssues(meetings: PlacedMeeting[], available: Availability = alwaysAvailable): Issue[] {
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
    for (const who of [m.team, m.dm]) if (!available(who, m.slot)) issues.push({ type: 'unavailable', team: m.team, dm: m.dm, slot: m.slot, who })
  }
  return issues
}

export interface Stats {
  meetings: number
  /** The most meetings any board could hold: the smaller side × slots. */
  capacity: number
  /** Requested pairs that did not get a meeting, strongest first. */
  unmet: Pair[]
}

export function computeStats(input: ScheduleInput, meetings: PlacedMeeting[]): Stats {
  const { byPair } = indexMeetings(meetings)
  const unmet = allPairs(input).filter((p) => rankOf(p) > 0 && !byPair.has(pairKey(p.team, p.dm)))
  unmet.sort((a, b) => rankOf(b) - rankOf(a) || a.di - b.di || a.ti - b.ti)
  return { meetings: meetings.length, capacity: Math.min(input.dms.length, input.teams.length) * input.slots.length, unmet }
}
