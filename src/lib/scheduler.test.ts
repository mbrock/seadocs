import { test, expect } from 'vitest'
import {
  selectMeetings,
  assignSlots,
  buildSchedule,
  reassign,
  findIssues,
  computeStats,
  pairKey,
  type Meeting,
  type PlacedMeeting,
  type Participant,
  type Scores,
} from './scheduler'
import { demoProject, emptyProject, withParticipants, withSlots, withScores, seededRandom, randomScores } from './state'

const ids = (n: number, prefix: string): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))

function input(teamCount: number, dmCount: number, slotCount: number, dmScores: Scores = {}, teamScores: Scores = {}) {
  return { teams: ids(teamCount, 't'), dms: ids(dmCount, 'd'), slotCount, dmScores, teamScores }
}

function expectValidPlacement(placed: PlacedMeeting[], slotCount: number) {
  const seen = new Set<string>()
  for (const m of placed) {
    expect(m.slot).toBeGreaterThanOrEqual(0)
    expect(m.slot).toBeLessThan(slotCount)
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
    const p = randomScores(withSlots(withParticipants(emptyProject(), names(T, 'Team '), names(D, 'DM ')), S, []), rand)
    const chosen = selectMeetings({ ...p, fillGaps: rand() > 0.5 })
    const placed = assignSlots(chosen, S)
    expect(placed).toHaveLength(chosen.length)
    expectValidPlacement(placed, S)
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
  const placed = assignSlots(meetings, 2)
  expect(placed).toHaveLength(6)
  expectValidPlacement(placed, 2)
})

test('assignSlots: throws when someone exceeds the cap', () => {
  expect(() => assignSlots([{ team: 't1', dm: 'd1' }, { team: 't1', dm: 'd2' }], 1)).toThrow(/Team t1/)
})

test('buildSchedule on the demo: every chosen meeting is placed', () => {
  const p = demoProject()
  const chosen = selectMeetings(p)
  const placed = buildSchedule(p)
  expect(placed).toHaveLength(chosen.length)
  expectValidPlacement(placed, p.slotCount)
  const stats = computeStats(p, placed)
  expect(stats.meetings).toBe(placed.length)
  expect(stats.mustMeetSatisfied).toBeGreaterThan(0)
})

test('reassign: frees, assigns, and swaps', () => {
  const start: PlacedMeeting[] = [
    { team: 't1', dm: 'd1', slot: 0 },
    { team: 't2', dm: 'd2', slot: 0 },
  ]
  expect(reassign(start, 0, 'd1', null)).toEqual([{ team: 't2', dm: 'd2', slot: 0 }])

  const swapped = reassign(start, 0, 'd1', 't2')
  expect(new Set(swapped.map((m) => `${m.team}-${m.dm}-${m.slot}`))).toEqual(new Set(['t2-d1-0', 't1-d2-0']))
  expect(findIssues(swapped)).toEqual([])

  const moved = reassign([{ team: 't1', dm: 'd1', slot: 0 }], 0, 'd2', 't1')
  expect(moved).toEqual([{ team: 't1', dm: 'd2', slot: 0 }])
})

test('findIssues: reports duplicates and clashes', () => {
  const issues = findIssues([
    { team: 't1', dm: 'd1', slot: 0 },
    { team: 't1', dm: 'd1', slot: 1 },
    { team: 't2', dm: 'd1', slot: 0 },
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
