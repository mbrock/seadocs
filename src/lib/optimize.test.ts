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

  test('dm-first and fair are lexicographic: no candidate misses fewer DM asks, and the recommended board inherits that', () => {
    const candidates = candidateSelections(input)
    const missedDm = (recipe: string) => measure(input, placeCompactly(candidates.find((c) => c.recipe === recipe)!.meetings, input.slots)).missedDm
    const best = missedDm('dm-first')
    expect(missedDm('fair')).toBe(best)
    for (const c of candidates) {
      expect(measure(input, placeCompactly(c.meetings, input.slots)).missedDm, c.recipe).toBeGreaterThanOrEqual(best)
    }
    // The frontier is sorted in objective order, so the first board misses no more DM asks than 'dm-first' does.
    expect(optimize(input)[0].objectives.missedDm).toBe(best)
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
