import { describe as suite, expect, test } from 'vitest'
import { describe, nameAlternatives } from './describe'
import type { Objectives } from './objectives'

const zero: Objectives = { missedMust: 0, missedPriority: 0, missedInterested: 0, teamsShort: 0, dmGaps: 0, missedTeam: 0, fillers: 0, teamGaps: 0 }
const alt = (o: Partial<Objectives>) => ({ objectives: { ...zero, ...o }, meetings: [], recipe: 'test' })

suite('nameAlternatives', () => {
  test('first is Recommended; others are named by their first win and priced by their losses', () => {
    const names = nameAlternatives([alt({ missedInterested: 3, dmGaps: 2, missedTeam: 10 }), alt({ missedInterested: 9, dmGaps: 4, missedTeam: 9 }), alt({ missedInterested: 3, dmGaps: 0, missedTeam: 10 })])
    expect(names[0]).toEqual({ name: 'Recommended', gain: '', cost: '' })
    expect(names[1]).toEqual({ name: 'More team asks met', gain: '1 more team ask met', cost: 'costs 6 interested asks, 2 DM windows' })
    expect(names[2]).toEqual({ name: 'Fewer DM windows', gain: '2 fewer DM windows', cost: '' })
  })
})

suite('describe', () => {
  test('reads as met-of-asked, with windows and fillers after the dot', () => {
    const o = { ...zero, missedPriority: 3, missedInterested: 25, missedTeam: 50, dmGaps: 3 }
    expect(describe(o, { missedMust: 11, missedPriority: 47, missedInterested: 84, missedTeam: 165 })).toBe(
      'every must-meet, 44 of 47 priorities, 59 of 84 interested, 115 of 165 team asks · 3 DM windows',
    )
  })
  test('a missed must-meet is spelt out', () => {
    expect(describe({ ...zero, missedMust: 1 }, { missedMust: 11 })).toBe('10 of 11 must-meets')
  })
})
