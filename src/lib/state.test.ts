import { test, expect } from 'vitest'
import { emptyProject, parseNames, withParticipants, withSlots, cycleScore, serialize, deserialize, slotLabel, demoProject } from './state'
import { pairKey } from './scheduler'

test('parseNames trims, drops blanks and duplicates', () => {
  expect(parseNames(' A \n\nB\nA\n  ')).toEqual(['A', 'B'])
})

test('withParticipants keeps ids for names that survive, so scores survive too', () => {
  let p = withParticipants(emptyProject(), ['Alpha', 'Beta'], ['Fund X'])
  const alpha = p.teams[0].id
  const fund = p.dms[0].id
  p = cycleScore(p, 'dm', alpha, fund)
  p = cycleScore(p, 'dm', alpha, fund)
  expect(p.dmScores[pairKey(alpha, fund)]).toBe(2)

  // Remove Beta, add Gamma, reorder: Alpha keeps its id and score.
  p = withParticipants(p, ['Gamma', 'Alpha'], ['Fund X'])
  expect(p.teams[1].id).toBe(alpha)
  expect(p.dmScores[pairKey(alpha, fund)]).toBe(2)
  expect(p.teams[0].id).not.toBe(alpha)
  expect(p.teams).toHaveLength(2)
})

test('withParticipants prunes scores and meetings for removed people', () => {
  let p = withParticipants(emptyProject(), ['A', 'B'], ['X'])
  const [a, b] = p.teams.map((t) => t.id)
  const x = p.dms[0].id
  p = cycleScore(p, 'dm', b, x)
  p = { ...p, meetings: [{ team: b, dm: x, slot: 0 }, { team: a, dm: x, slot: 1 }] }
  p = withParticipants(p, ['A'], ['X'])
  expect(p.dmScores).toEqual({})
  expect(p.meetings).toEqual([{ team: a, dm: x, slot: 1 }])
})

test('withSlots clamps and drops meetings past the new end', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X'])
  p = { ...p, meetings: [{ team: p.teams[0].id, dm: p.dms[0].id, slot: 5 }] }
  p = withSlots(p, 3, ['09:00'])
  expect(p.slotCount).toBe(3)
  expect(p.meetings).toEqual([])
  expect(slotLabel(p, 0)).toBe('09:00')
  expect(slotLabel(p, 2)).toBe('Slot 3')
  expect(withSlots(p, 0, []).slotCount).toBe(1)
  expect(withSlots(p, 'abc', []).slotCount).toBe(1)
})

test('cycleScore wraps 0→1→2→3→0 and removes zero entries', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X'])
  const k = pairKey(p.teams[0].id, p.dms[0].id)
  for (const expected of [1, 2, 3]) {
    p = cycleScore(p, 'team', p.teams[0].id, p.dms[0].id)
    expect(p.teamScores[k]).toBe(expected)
  }
  p = cycleScore(p, 'team', p.teams[0].id, p.dms[0].id)
  expect(k in p.teamScores).toBe(false)
})

test('serialize/deserialize round-trips', () => {
  const p = demoProject(3)
  const back = deserialize(serialize(p))
  expect(back).toEqual(p)
})

test('deserialize reads v1 files from the original prototype', () => {
  const v1 = {
    version: 1,
    teams: ['Team A', 'Team B'],
    dms: ['DM 1', 'DM 2'],
    slotCount: 2,
    slotLabels: ['09:00', '09:20'],
    dmScores: { '0_1': 3, '1_0': 1 },
    teamScores: { '1_1': 2 },
    schedule: [
      [1, 0],
      [null, null],
    ],
  }
  const p = deserialize(JSON.stringify(v1))
  expect(p.teams.map((t) => t.name)).toEqual(['Team A', 'Team B'])
  const [a, b] = p.teams.map((t) => t.id)
  const [d1, d2] = p.dms.map((d) => d.id)
  expect(p.dmScores[pairKey(a, d2)]).toBe(3)
  expect(p.dmScores[pairKey(b, d1)]).toBe(1)
  expect(p.teamScores[pairKey(b, d2)]).toBe(2)
  expect(p.meetings).toEqual([
    { team: b, dm: d1, slot: 0 },
    { team: a, dm: d2, slot: 0 },
  ])
  expect(p.slotLabels[1]).toBe('09:20')
})

test('deserialize rejects junk', () => {
  expect(() => deserialize('{"hello":1}')).toThrow(/Not a Meeting Board/)
  expect(() => deserialize('[]')).toThrow(/Not a Meeting Board/)
})
