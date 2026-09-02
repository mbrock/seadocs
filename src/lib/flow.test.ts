import { describe, expect, test } from 'vitest'
import { selectByFlow } from './flow'
import { allPairs, type Meeting, type Participant, type ScheduleInput } from './scheduler'
import { numberedSlots } from './fixtures'

const people = (prefix: string, n: number): Participant[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))

function input(T: number, D: number, slotCount: number, dm: Record<string, number>, team: Record<string, number> = {}): ScheduleInput {
  return { teams: people('t', T), dms: people('d', D), dmScores: dm, teamScores: team, slots: numberedSlots(slotCount) }
}

/** Every subset of pairs respecting the cap, best total weight. Only for tiny inputs. */
function bruteBest(inp: ScheduleInput, weight: (dm: number, team: number) => number): number {
  const pairs = allPairs(inp).filter((p) => weight(p.dmScore, p.teamScore) > 0)
  let best = 0
  for (let mask = 0; mask < 1 << pairs.length; mask++) {
    const load = new Map<string, number>()
    let total = 0
    let ok = true
    for (let i = 0; i < pairs.length && ok; i++) {
      if (!(mask & (1 << i))) continue
      const p = pairs[i]
      for (const id of [p.team, p.dm]) {
        load.set(id, (load.get(id) ?? 0) + 1)
        if (load.get(id)! > inp.slots.length) ok = false
      }
      total += weight(p.dmScore, p.teamScore)
    }
    if (ok) best = Math.max(best, total)
  }
  return best
}

const totalWeight = (inp: ScheduleInput, ms: Meeting[], weight: (dm: number, team: number) => number) => {
  const byKey = new Map(allPairs(inp).map((p) => [`${p.team}|${p.dm}`, p]))
  return ms.reduce((s, m) => {
    const p = byKey.get(`${m.team}|${m.dm}`)!
    return s + weight(p.dmScore, p.teamScore)
  }, 0)
}

describe('selectByFlow', () => {
  test('matches brute force on small instances', () => {
    // 3 teams × 3 dms, 2 slots, mixed scores, three different weightings.
    const inp = input(3, 3, 2, { 't1|d1': 3, 't1|d2': 3, 't1|d3': 3, 't2|d1': 2, 't3|d1': 1, 't3|d2': 2 }, { 't2|d2': 3, 't3|d3': 1 })
    for (const weight of [(dm: number, team: number) => 100 * dm + team, (dm: number, team: number) => dm + team, (dm: number, team: number) => dm + 100 * team]) {
      const chosen = selectByFlow(inp, { weight })
      expect(totalWeight(inp, chosen, weight)).toBe(bruteBest(inp, weight))
      const load = new Map<string, number>()
      for (const m of chosen) for (const id of [m.team, m.dm]) load.set(id, (load.get(id) ?? 0) + 1)
      for (const n of load.values()) expect(n).toBeLessThanOrEqual(2)
    }
  })

  test('finds the optimum the greedy misses', () => {
    // One slot. Greedy takes t1-d1 (3) first, which fills both t1 and d1, and
    // t2-d1 (2) is lost: one meeting, weight 3. Optimal is t1-d2 + t2-d1 = 5.
    const inp = input(2, 2, 1, { 't1|d1': 3, 't1|d2': 3, 't2|d1': 2 })
    const chosen = selectByFlow(inp, { weight: (dm) => dm })
    expect(chosen).toHaveLength(2)
    expect(totalWeight(inp, chosen, (dm) => dm)).toBe(5)
  })

  test('team floor takes precedence over interest', () => {
    // One slot. Best interest: t1-d1 alone (3) beats t1-d2 + t2-d1 (1 + 1),
    // leaving t2 with nothing. A floor of 1 per team forces the second option.
    const inp = input(2, 2, 1, { 't1|d1': 3, 't2|d1': 1, 't1|d2': 1 })
    const noFloor = selectByFlow(inp, { weight: (dm) => dm })
    expect(noFloor).toEqual([{ team: 't1', dm: 'd1' }])
    const floored = selectByFlow(inp, { weight: (dm) => dm, teamFloor: 1 })
    expect(floored.map((m) => `${m.team}|${m.dm}`).sort()).toEqual(['t1|d2', 't2|d1'])
  })

  test('never chooses pairs with zero weight', () => {
    const inp = input(2, 2, 2, { 't1|d1': 1 })
    expect(selectByFlow(inp, { weight: (dm) => dm })).toEqual([{ team: 't1', dm: 'd1' }])
  })
})
