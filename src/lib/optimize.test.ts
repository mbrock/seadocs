import { describe, expect, test } from 'vitest'
import { demoProject } from './state'
import { candidateSelections, optimize, placeCompactly } from './optimize'
import { gapsOf, measure } from './objectives'
import { assignSlots, findIssues } from './scheduler'

const input = { ...demoProject(), teamFloor: 1 }

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

  test('compaction removes DM windows without changing meetings', () => {
    const sel = candidateSelections(input)[0].meetings
    const plain = assignSlots(sel, input.slotCount)
    const compact = placeCompactly(sel, input.slotCount)
    console.log('dm gaps before', gapsOf(plain, 'dm'), 'after', gapsOf(compact, 'dm'), '| team gaps', gapsOf(plain, 'team'), '->', gapsOf(compact, 'team'))
    expect(gapsOf(compact, 'dm')).toBeLessThanOrEqual(gapsOf(plain, 'dm'))
    expect(findIssues(compact)).toEqual([])
    expect(measure(input, compact).fillers).toBe(measure(input, plain).fillers)
  })
})
