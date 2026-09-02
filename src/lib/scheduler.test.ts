import { test, expect } from 'vitest'
import {
  selectMeetings,
  assignSlots,
  assignCell,
  assignEffect,
  availabilityOf,
  buildSchedule,
  reassign,
  findIssues,
  computeStats,
  pairKey,
  type Meeting,
  type PlacedMeeting,
  type Participant,
  type Scores,
  type Slot,
} from './scheduler'
import { emptyProject, withParticipants, withSlots, withScores } from './project'
import { demoProject, numberedSlots, seededRandom, randomScores } from './fixtures'

const ids = (n: number, prefix: string): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))

function input(teamCount: number, dmCount: number, slotCount: number, dmScores: Scores = {}, teamScores: Scores = {}) {
  return { teams: ids(teamCount, 't'), dms: ids(dmCount, 'd'), slots: numberedSlots(slotCount), dmScores, teamScores }
}

function expectValidPlacement(placed: PlacedMeeting[], slots: Slot[]) {
  const known = new Set(slots.map((s) => s.id))
  const seen = new Set<string>()
  for (const m of placed) {
    expect(known.has(m.slot), `unknown slot ${m.slot}`).toBe(true)
    for (const k of [`t|${m.team}|${m.slot}`, `d|${m.dm}|${m.slot}`]) {
      expect(seen.has(k), `double booking: ${k}`).toBe(false)
      seen.add(k)
    }
  }
}

test('selectMeetings: DM interest beats team interest, caps respected', () => {
  const p = input(3, 1, 2, { [pairKey('t1', 'd1')]: 1, [pairKey('t2', 'd1')]: 3 }, { [pairKey('t3', 'd1')]: 3 })
  expect(selectMeetings(p).map((m) => m.team)).toEqual(['t2', 't1'])
})

test('selectMeetings: team-only requests are honoured when there is room', () => {
  const p = input(2, 1, 5, {}, { [pairKey('t1', 'd1')]: 1 })
  expect(selectMeetings(p)).toEqual([{ team: 't1', dm: 'd1' }])
})

test('selectMeetings: equal interest is spread to teams with fewer meetings', () => {
  // d1 and d2 each have 1 slot; both like t1 and t2 equally. Fair result: each team gets one.
  const scores: Scores = {}
  for (const t of ['t1', 't2']) for (const d of ['d1', 'd2']) scores[pairKey(t, d)] = 2
  const chosen = selectMeetings(input(2, 2, 1, scores))
  expect(chosen).toHaveLength(2)
  expect(new Set(chosen.map((m) => m.team))).toEqual(new Set(['t1', 't2']))
})

test('selectMeetings: nothing is chosen when nobody asked, unless fillGaps', () => {
  expect(selectMeetings(input(3, 3, 2))).toEqual([])
  expect(selectMeetings({ ...input(2, 2, 2), fillGaps: true })).toHaveLength(4)
  // Greedy selection is not optimal: with 3×3 and 2 slots a perfect 6 exists,
  // but load-balanced greedy paints itself into a corner and finds 5.
  // Kept as documentation; an optimal selector (max-flow) would make this 6.
  expect(selectMeetings({ ...input(3, 3, 2), fillGaps: true })).toHaveLength(5)
})

test('selectMeetings is deterministic', () => {
  const p = demoProject(7)
  expect(selectMeetings(p)).toEqual(selectMeetings(p))
})

test('assignSlots: places every meeting without double booking (random graphs)', () => {
  const rand = seededRandom(42)
  for (let trial = 0; trial < 200; trial++) {
    const T = 1 + Math.floor(rand() * 12)
    const D = 1 + Math.floor(rand() * 12)
    const S = 1 + Math.floor(rand() * 8)
    const names = (n: number, prefix: string) => ids(n, prefix).map((x) => x.name)
    const p = randomScores(withSlots(withParticipants(emptyProject(), names(T, 'Team '), names(D, 'DM ')), Array(S).fill('')), rand)
    const chosen = selectMeetings({ ...p, fillGaps: rand() > 0.5 })
    const placed = assignSlots(chosen, p.slots)
    expect(placed).toHaveLength(chosen.length)
    expectValidPlacement(placed, p.slots)
  }
})

test('assignSlots: handles a 6-cycle that defeats greedy earliest-slot placement', () => {
  // Two slots, everybody has exactly two meetings, arranged in a cycle
  // t1-d1-t2-d2-t3-d3-t1. Greedy earliest-slot in this order puts the first three
  // in slot 0 and then t2-d1, t3-d2 in slot 1 — leaving t1-d3 with no common free
  // slot. Edge colouring recolours the chain and fits all six.
  const meetings: Meeting[] = [
    { team: 't1', dm: 'd1' },
    { team: 't2', dm: 'd2' },
    { team: 't3', dm: 'd3' },
    { team: 't2', dm: 'd1' },
    { team: 't3', dm: 'd2' },
    { team: 't1', dm: 'd3' },
  ]
  const slots = numberedSlots(2)
  const placed = assignSlots(meetings, slots)
  expect(placed).toHaveLength(6)
  expectValidPlacement(placed, slots)
})

test('assignSlots: leaves out what cannot be placed', () => {
  expect(assignSlots([{ team: 't1', dm: 'd1' }, { team: 't1', dm: 'd2' }], numberedSlots(1))).toHaveLength(1)
})

test('assignSlots: respects availability, routing chains around blocked slots', () => {
  const rand = seededRandom(7)
  let dropped = 0
  let total = 0
  for (let trial = 0; trial < 200; trial++) {
    const T = 2 + Math.floor(rand() * 10)
    const D = 2 + Math.floor(rand() * 10)
    const S = 2 + Math.floor(rand() * 7)
    const names = (n: number, prefix: string) => ids(n, prefix).map((x) => x.name)
    let p = randomScores(withSlots(withParticipants(emptyProject(), names(T, 'Team '), names(D, 'DM ')), Array(S).fill('')), rand)
    // Block a few random (person, slot) cells.
    const block = (people: Participant[]) =>
      people.map((x) => {
        const unavailable = p.slots.filter(() => rand() < 0.15).map((s) => s.id)
        return unavailable.length ? { ...x, unavailable } : x
      })
    p = { ...p, teams: block(p.teams), dms: block(p.dms) }
    const available = availabilityOf([...p.teams, ...p.dms])
    const chosen = selectMeetings({ ...p, fillGaps: rand() > 0.5 })
    const placed = assignSlots(chosen, p.slots, available)
    expectValidPlacement(placed, p.slots)
    expect(findIssues(placed, available)).toEqual([])
    total += chosen.length
    dropped += chosen.length - placed.length
  }
  // Selection respects per-person caps, so almost everything still fits.
  expect(dropped / total).toBeLessThan(0.03)
})

test('assignCell refuses to put someone into a slot they cannot do', () => {
  const slots = numberedSlots(2)
  const available = availabilityOf([{ id: 'd1', name: 'D1', unavailable: [slots[1].id] }])
  const before: PlacedMeeting[] = []
  expect(assignEffect(before, slots[1].id, 'dm', 'd1', 't1', available)).toEqual({ kind: 'unavailable', who: 'd1' })
  expect(assignEffect(before, slots[1].id, 'team', 't1', 'd1', available)).toEqual({ kind: 'unavailable', who: 'd1' })
  expect(assignCell(before, slots[1].id, 'dm', 'd1', 't1', available)).toBe(before)
  expect(assignCell(before, slots[0].id, 'dm', 'd1', 't1', available)).toHaveLength(1)
  const bad: PlacedMeeting[] = [{ team: 't1', dm: 'd1', slot: slots[1].id }]
  expect(findIssues(bad, available)).toEqual([{ type: 'unavailable', team: 't1', dm: 'd1', slot: slots[1].id, who: 'd1' }])
})

test('buildSchedule on the demo: every chosen meeting is placed', () => {
  const p = demoProject()
  const chosen = selectMeetings(p)
  const placed = buildSchedule(p)
  expect(placed).toHaveLength(chosen.length)
  expectValidPlacement(placed, p.slots)
  const stats = computeStats(p, placed)
  expect(stats.meetings).toBe(placed.length)
  expect(stats.mustMeetSatisfied).toBeGreaterThan(0)
})

test('reassign: frees, assigns, and swaps', () => {
  const start: PlacedMeeting[] = [
    { team: 't1', dm: 'd1', slot: 's1' },
    { team: 't2', dm: 'd2', slot: 's1' },
  ]
  expect(reassign(start, 's1', 'd1', null)).toEqual([{ team: 't2', dm: 'd2', slot: 's1' }])

  const swapped = reassign(start, 's1', 'd1', 't2')
  expect(new Set(swapped.map((m) => `${m.team}-${m.dm}-${m.slot}`))).toEqual(new Set(['t2-d1-s1', 't1-d2-s1']))
  expect(findIssues(swapped)).toEqual([])

  const moved = reassign([{ team: 't1', dm: 'd1', slot: 's1' }], 's1', 'd2', 't1')
  expect(moved).toEqual([{ team: 't1', dm: 'd2', slot: 's1' }])
})

test('findIssues: reports duplicates and clashes', () => {
  const issues = findIssues([
    { team: 't1', dm: 'd1', slot: 's1' },
    { team: 't1', dm: 'd1', slot: 's2' },
    { team: 't2', dm: 'd1', slot: 's1' },
  ])
  expect(issues.map((i) => i.type)).toEqual(['duplicate', 'dm-clash'])
})

test('computeStats: unmet lists requested pairs that were not scheduled, strongest first', () => {
  const p = input(3, 1, 1, { [pairKey('t1', 'd1')]: 3, [pairKey('t2', 'd1')]: 2 }, { [pairKey('t3', 'd1')]: 1 })
  const stats = computeStats(p, buildSchedule(p))
  expect(stats.mustMeetSatisfied).toBe(1)
  expect(stats.unmet.map((u) => u.team)).toEqual(['t2', 't3'])
  expect(stats.teamsWithoutMeetings).toBe(2)
})

test('withScores prunes unknown participants', () => {
  const base = { ...emptyProject(), ...input(1, 1, 1) }
  const p = withScores(base, { [pairKey('t1', 'd1')]: 2, [pairKey('t9', 'd1')]: 3 }, {})
  expect(Object.keys(p.dmScores)).toEqual([pairKey('t1', 'd1')])
})
