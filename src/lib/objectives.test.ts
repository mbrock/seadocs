import { describe, expect, test } from 'vitest'
import { addToFrontier, compareLex, dominates, gapsOf, measure, type Objectives } from './objectives'
import { compactSlots, participantsWithWindows } from './compact'
import { optimize } from './optimize'
import { assignSlots, findIssues, selectMeetings, type Asks, type Participant, type PlacedMeeting } from './scheduler'
import { emptyProject, withParticipants, withSlotCount } from './project'
import { numberedSlots, seededRandom } from './fixtures'

const people = (prefix: string, n: number): Participant[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))
const zero: Objectives = { missedDm: 0, dmsUnderHalf: 0, teamsEmpty: 0, dmGaps: 0, missedTeam: 0, dmIdle: 0, teamGaps: 0 }

describe('objectives', () => {
  test('measure counts each dimension', () => {
    const input = {
      teams: people('t', 3),
      dms: people('d', 2),
      slots: numberedSlots(4),
      dmAsks: { 't1|d1': true, 't2|d1': true, 't1|d2': true } as Asks,
      teamAsks: { 't2|d2': true, 't1|d1': true } as Asks,
    }
    const meetings: PlacedMeeting[] = [
      { team: 't1', dm: 'd1', slot: 's1' },
      { team: 't2', dm: 'd1', slot: 's4' }, // d1 idle in s2, s3 → 2 windows
      { team: 't3', dm: 'd2', slot: 's2' }, // nobody asked, still counts as a meeting
    ]
    expect(measure(input, meetings)).toEqual({
      missedDm: 1, // t1|d2
      dmsUnderHalf: 1, // d2 asked for t1 only and did not get it
      teamsEmpty: 0,
      dmGaps: 2,
      missedTeam: 1, // t2|d2
      dmIdle: 5, // d1 sits out 2 of 4 slots, d2 sits out 3
      teamGaps: 0,
    })
    expect(measure(input, meetings.slice(0, 1)).teamsEmpty).toBe(2)
    expect(measure(input, []).missedDm).toBe(3)
  })

  test('dominance and frontier', () => {
    const a = { ...zero, missedDm: 1 }
    const b = { ...zero, missedDm: 2 }
    const c = { ...zero, missedDm: 0, missedTeam: 5 }
    expect(dominates(a, b)).toBe(true)
    expect(dominates(b, a)).toBe(false)
    expect(dominates(a, a)).toBe(false)
    expect(dominates(a, c)).toBe(false) // a loses on missedDm, c loses on missedTeam
    let f: Objectives[] = []
    f = addToFrontier(f, b, (o) => o)
    f = addToFrontier(f, c, (o) => o)
    f = addToFrontier(f, a, (o) => o) // evicts b
    f = addToFrontier(f, { ...a }, (o) => o) // duplicate ignored
    expect(f).toEqual([c, a])
    expect([...f].sort(compareLex)).toEqual([c, a]) // c misses no DM ask → first in priority order
  })

  test('gapsOf', () => {
    const ms: PlacedMeeting[] = [
      { team: 't1', dm: 'd1', slot: 's1' },
      { team: 't1', dm: 'd2', slot: 's5' },
      { team: 't2', dm: 'd2', slot: 's6' },
    ]
    const slots = numberedSlots(6)
    expect(gapsOf(ms, slots, 'team')).toBe(3)
    expect(gapsOf(ms, slots, 'dm')).toBe(0)
  })
})

/**
 * A fairly busy day: 26 × 26, 12 slots, most people booked 9–12 times.
 * Windows appear when people are nearly but not quite fully booked: on a very
 * sparse day earliest-slot placement leaves none, and when one side is
 * completely full it has none either.
 */
function busyProject(seed: number, density = 0.3) {
  let p = withParticipants(emptyProject(), Array.from({ length: 26 }, (_, i) => `Team ${i + 1}`), Array.from({ length: 26 }, (_, i) => `DM ${i + 1}`))
  p = withSlotCount(p, 12)
  const rnd = seededRandom(seed)
  const dmAsks: Record<string, true> = {}
  const teamAsks: Record<string, true> = {}
  for (const t of p.teams) {
    for (const d of p.dms) {
      if (rnd() < density) dmAsks[`${t.id}|${d.id}`] = true
      if (rnd() < density) teamAsks[`${t.id}|${d.id}`] = true
    }
  }
  return { ...p, dmAsks, teamAsks }
}

describe('compactSlots', () => {
  test('keeps the same meetings, no clashes, and never more windows', () => {
    let improvedSomewhere = false
    for (const seed of [1, 2, 4]) {
      const input = busyProject(seed)
      // A requests-only selection leaves seats empty, so there are windows to close.
      const selection = selectMeetings(input)
      const plain = assignSlots(selection, input.slots)
      const compact = compactSlots(plain, input.slots)
      expect(compact.map(({ team, dm }) => `${team}|${dm}`).sort()).toEqual(plain.map(({ team, dm }) => `${team}|${dm}`).sort())
      expect(findIssues(compact)).toEqual([])
      expect(gapsOf(compact, input.slots, 'dm')).toBeLessThanOrEqual(gapsOf(plain, input.slots, 'dm'))
      if (gapsOf(compact, input.slots, 'dm') < gapsOf(plain, input.slots, 'dm')) improvedSomewhere = true
      expect(participantsWithWindows(compact, input.slots, 'dm').length).toBeLessThanOrEqual(participantsWithWindows(plain, input.slots, 'dm').length)
    }
    expect(improvedSomewhere).toBe(true)
  })

  test('the frontier really trades DM interest against DM windows or team interest', () => {
    const front = optimize(busyProject(1))
    expect(front.length).toBeGreaterThanOrEqual(2)
    const [best, ...rest] = front
    for (const other of rest) {
      expect(dominates(best.objectives, other.objectives)).toBe(false)
    }
  })
})
