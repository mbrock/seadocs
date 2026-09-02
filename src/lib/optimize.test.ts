import { describe, expect, test } from 'vitest'
import { demoProject } from './fixtures'
import { candidateSelections, optimize, placeCompactly } from './optimize'
import { gapsOf, measure } from './objectives'
import { assignSlots, findIssues } from './scheduler'

const input = demoProject()

describe('optimize on the demo', () => {
  test('frontier is valid and small', () => {
    const t0 = performance.now()
    const front = optimize(input)
    const ms = performance.now() - t0
    console.log(`frontier ${front.length} points in ${ms.toFixed(0)}ms`)
    for (const a of front) console.log(a.recipe.padEnd(28), JSON.stringify(a.objectives))
    expect(front.length).toBeGreaterThan(0)
    expect(front.length).toBeLessThan(40)
    for (const a of front) expect(findIssues(a.meetings)).toEqual([])
    expect(ms).toBeLessThan(5000)
  })

  test('dm-first is lexicographic in points: no candidate loses less DM interest', () => {
    const candidates = candidateSelections(input)
    const dmPoints = (o: ReturnType<typeof measure>) => 3 * o.missedMust + 2 * o.missedPriority + o.missedInterested
    const dmFirst = dmPoints(measure(input, placeCompactly(candidates.find((c) => c.recipe === 'dm-first')!.meetings, input.slots)))
    for (const c of candidates) {
      expect(dmPoints(measure(input, placeCompactly(c.meetings, input.slots))), c.recipe).toBeGreaterThanOrEqual(dmFirst)
    }
  })

  test('tiered is lexicographic in tiers, and the recommended board inherits that', () => {
    const candidates = candidateSelections(input)
    const tiersOf = (o: ReturnType<typeof measure>) => [o.missedMust, o.missedPriority, o.missedInterested]
    const tiered = tiersOf(measure(input, placeCompactly(candidates.find((c) => c.recipe === 'tiered')!.meetings, input.slots)))
    const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    for (const c of candidates) {
      expect(cmp(tiersOf(measure(input, placeCompactly(c.meetings, input.slots))), tiered), c.recipe).toBeGreaterThanOrEqual(0)
    }
    // The frontier is sorted in objective order, so the first board misses no more of each tier than 'tiered' does.
    const best = optimize(input)[0].objectives
    expect(cmp(tiersOf(best), tiered)).toBe(0)
  })

  test('compaction removes DM windows without changing meetings', () => {
    const sel = candidateSelections(input)[0].meetings
    const plain = assignSlots(sel, input.slots)
    const compact = placeCompactly(sel, input.slots)
    console.log('dm gaps before', gapsOf(plain, input.slots, 'dm'), 'after', gapsOf(compact, input.slots, 'dm'), '| team gaps', gapsOf(plain, input.slots, 'team'), '->', gapsOf(compact, input.slots, 'team'))
    expect(gapsOf(compact, input.slots, 'dm')).toBeLessThanOrEqual(gapsOf(plain, input.slots, 'dm'))
    expect(findIssues(compact)).toEqual([])
    expect(measure(input, compact).fillers).toBe(measure(input, plain).fillers)
  })
})
