import { describe, expect, test } from 'vitest'
import { selectByFlow } from './flow'
import { allPairs, type Meeting, type Participant, type ScheduleInput } from './scheduler'
import { numberedSlots } from './fixtures'

const people = (prefix: string, n: number): Participant[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }))

type Weight = (dmAsked: boolean, teamAsked: boolean) => number
const asks = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, true as const]))

function input(T: number, D: number, slotCount: number, dm: string[], team: string[] = []): ScheduleInput {
  return { teams: people('t', T), dms: people('d', D), dmAsks: asks(dm), teamAsks: asks(team), slots: numberedSlots(slotCount) }
}

/** Every subset of pairs respecting the cap, best total weight. Only for tiny inputs. */
function bruteBest(inp: ScheduleInput, weight: Weight): number {
  const pairs = allPairs(inp).filter((p) => weight(p.dmAsked, p.teamAsked) > 0)
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
      total += weight(p.dmAsked, p.teamAsked)
    }
    if (ok) best = Math.max(best, total)
  }
  return best
}

const totalWeight = (inp: ScheduleInput, ms: Meeting[], weight: Weight) => {
  const byKey = new Map(allPairs(inp).map((p) => [`${p.team}|${p.dm}`, p]))
  return ms.reduce((s, m) => {
    const p = byKey.get(`${m.team}|${m.dm}`)!
    return s + weight(p.dmAsked, p.teamAsked)
  }, 0)
}

describe('selectByFlow', () => {
  test('matches brute force on small instances', () => {
    // 3 teams × 3 dms, 2 slots, mixed asks, three different weightings.
    const inp = input(3, 3, 2, ['t1|d1', 't1|d2', 't1|d3', 't2|d1', 't3|d1', 't3|d2'], ['t2|d2', 't3|d3', 't1|d1'])
    const n = (b: boolean) => (b ? 1 : 0)
    const weights: Weight[] = [(dm, team) => 100 * n(dm) + n(team), (dm, team) => n(dm) + n(team), (dm, team) => n(dm) + 100 * n(team)]
    for (const weight of weights) {
      const chosen = selectByFlow(inp, { weight })
      expect(totalWeight(inp, chosen, weight)).toBe(bruteBest(inp, weight))
      const load = new Map<string, number>()
      for (const m of chosen) for (const id of [m.team, m.dm]) load.set(id, (load.get(id) ?? 0) + 1)
      for (const n of load.values()) expect(n).toBeLessThanOrEqual(2)
    }
  })

  test('finds the optimum the greedy misses', () => {
    // One slot. Taking t1-d1 first fills both t1 and d1, and t2-d1 is lost:
    // one meeting. Optimal is t1-d2 + t2-d1: two DM asks met.
    const inp = input(2, 2, 1, ['t1|d1', 't1|d2', 't2|d1'])
    const dmOnly: Weight = (dm) => (dm ? 1 : 0)
    const chosen = selectByFlow(inp, { weight: dmOnly })
    expect(chosen).toHaveLength(2)
    expect(totalWeight(inp, chosen, dmOnly)).toBe(2)
  })

  test('team floor takes precedence over interest', () => {
    // One slot. Best interest: t1-d1 alone (asked by both, 3) beats
    // t1-d2 + t2-d1 (team asks only, 1 + 1), leaving t2 with nothing.
    // A floor of 1 per team forces the second option.
    const inp = input(2, 2, 1, ['t1|d1'], ['t1|d1', 't2|d1', 't1|d2'])
    const weight: Weight = (dm, team) => (dm ? 2 : 0) + (team ? 1 : 0)
    const noFloor = selectByFlow(inp, { weight })
    expect(noFloor).toEqual([{ team: 't1', dm: 'd1' }])
    const floored = selectByFlow(inp, { weight, teamFloor: 1 })
    expect(floored.map((m) => `${m.team}|${m.dm}`).sort()).toEqual(['t1|d2', 't2|d1'])
  })

  test('never chooses pairs with zero weight', () => {
    const inp = input(2, 2, 2, ['t1|d1'])
    expect(selectByFlow(inp, { weight: (dm) => (dm ? 1 : 0) })).toEqual([{ team: 't1', dm: 'd1' }])
  })
})
