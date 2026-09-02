import { describe, expect, test } from 'vitest'
import { addToFrontier, compareLex, dominates, gapsOf, measure, type Objectives } from './objectives'
import { compactSlots, participantsWithWindows } from './compact'
import { optimize } from './optimize'
import { assignSlots, findIssues, type Participant, type PlacedMeeting } from './scheduler'
import { emptyProject, seededRandom, withParticipants } from './state'

const people = (prefix: string, n: number): Participant[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))
const zero: Objectives = { missedMust: 0, dmLoss: 0, teamsShort: 0, dmGaps: 0, teamLoss: 0, fillers: 0, teamGaps: 0 }

describe('objectives', () => {
  test('measure counts each dimension', () => {
    const input = {
      teams: people('t', 3),
      dms: people('d', 2),
      slotCount: 4,
      teamFloor: 1,
      dmScores: { 't1|d1': 3, 't2|d1': 1, 't1|d2': 2 },
      teamScores: { 't2|d2': 2, 't1|d1': 1 },
    }
    const meetings: PlacedMeeting[] = [
      { team: 't1', dm: 'd1', slot: 0 },
      { team: 't2', dm: 'd1', slot: 3 }, // d1 idle in slots 1,2 → 2 windows
      { team: 't3', dm: 'd2', slot: 1 }, // nobody asked → filler
    ]
    expect(measure(input, meetings)).toEqual({
      missedMust: 0,
      dmLoss: 2, // t1|d2
      teamsShort: 0,
      dmGaps: 2,
      teamLoss: 2, // t2|d2
      fillers: 1,
      teamGaps: 0,
    })
    expect(measure(input, meetings.slice(0, 1)).teamsShort).toBe(2)
    expect(measure(input, []).missedMust).toBe(1)
  })

  test('dominance and frontier', () => {
    const a = { ...zero, dmLoss: 1 }
    const b = { ...zero, dmLoss: 2 }
    const c = { ...zero, dmLoss: 0, teamLoss: 5 }
    expect(dominates(a, b)).toBe(true)
    expect(dominates(b, a)).toBe(false)
    expect(dominates(a, a)).toBe(false)
    expect(dominates(a, c)).toBe(false) // a loses on dmLoss, c loses on teamLoss
    let f: Objectives[] = []
    f = addToFrontier(f, b, (o) => o)
    f = addToFrontier(f, c, (o) => o)
    f = addToFrontier(f, a, (o) => o) // evicts b
    f = addToFrontier(f, { ...a }, (o) => o) // duplicate ignored
    expect(f).toEqual([c, a])
    expect([...f].sort(compareLex)).toEqual([c, a]) // c has dmLoss 0 → first in priority order
  })

  test('gapsOf', () => {
    const ms: PlacedMeeting[] = [
      { team: 't1', dm: 'd1', slot: 0 },
      { team: 't1', dm: 'd2', slot: 4 },
      { team: 't2', dm: 'd2', slot: 5 },
    ]
    expect(gapsOf(ms, 'team')).toBe(3)
    expect(gapsOf(ms, 'dm')).toBe(0)
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
  p = { ...p, slotCount: 12 }
  const rnd = seededRandom(seed)
  const dmScores: Record<string, number> = {}
  const teamScores: Record<string, number> = {}
  for (const t of p.teams) {
    for (const d of p.dms) {
      if (rnd() < density) dmScores[`${t.id}|${d.id}`] = 1 + Math.floor(rnd() * 3)
      if (rnd() < density) teamScores[`${t.id}|${d.id}`] = 1 + Math.floor(rnd() * 3)
    }
  }
  return { ...p, dmScores, teamScores, teamFloor: 1 }
}

describe('compactSlots', () => {
  test('keeps the same meetings, no clashes, and never more windows', () => {
    let improvedSomewhere = false
    for (const seed of [1, 2, 3]) {
      const input = busyProject(seed)
      const front = optimize(input)
      const selection = front[0].meetings.map(({ team, dm }) => ({ team, dm }))
      const plain = assignSlots(selection, input.slotCount)
      const compact = compactSlots(plain)
      expect(compact.map(({ team, dm }) => `${team}|${dm}`).sort()).toEqual(plain.map(({ team, dm }) => `${team}|${dm}`).sort())
      expect(findIssues(compact)).toEqual([])
      expect(gapsOf(compact, 'dm')).toBeLessThanOrEqual(gapsOf(plain, 'dm'))
      if (gapsOf(compact, 'dm') < gapsOf(plain, 'dm')) improvedSomewhere = true
      expect(participantsWithWindows(compact, 'dm').length).toBeLessThanOrEqual(participantsWithWindows(plain, 'dm').length)
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
