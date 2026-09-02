import { describe as suite, expect, test } from 'vitest'
import { describe, nameAlternatives } from './describe'
import type { Objectives } from './objectives'

const zero: Objectives = { missedDm: 0, dmsUnderHalf: 0, teamsEmpty: 0, dmGaps: 0, missedTeam: 0, fillers: 0, teamGaps: 0 }
const alt = (o: Partial<Objectives>) => ({ objectives: { ...zero, ...o }, meetings: [], recipe: 'test' })

suite('nameAlternatives', () => {
  test('first is Recommended; others are named by their first win and priced by their losses', () => {
    const names = nameAlternatives([alt({ missedDm: 3, dmGaps: 2, missedTeam: 10 }), alt({ missedDm: 9, dmGaps: 4, missedTeam: 9 }), alt({ missedDm: 3, dmGaps: 0, missedTeam: 10 })])
    expect(names[0]).toEqual({ name: 'Recommended', gain: '', cost: '' })
    expect(names[1]).toEqual({ name: 'More team asks met', gain: '1 more team ask met', cost: 'costs 6 DM asks, 2 DM windows' })
    expect(names[2]).toEqual({ name: 'Fewer DM windows', gain: '2 fewer DM windows', cost: '' })
  })
})

suite('describe', () => {
  test('reads as met-of-asked, with windows and fillers after the dot', () => {
    const o = { ...zero, missedDm: 28, missedTeam: 50, dmGaps: 3 }
    expect(describe(o, { missedDm: 142, missedTeam: 165 })).toBe(
      '114 of 142 DM asks, 115 of 165 team asks · 3 DM windows',
    )
  })
  test('meeting every DM ask is spelt out', () => {
    expect(describe({ ...zero }, { missedDm: 11 })).toBe('every DM ask')
  })
})
