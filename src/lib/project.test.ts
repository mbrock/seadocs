import { test, expect } from 'vitest'
import { emptyProject, parseNames, withParticipants, withSlots, withSlotCount, cycleScore, slotLabel } from './project'
import { deserialize, serialize } from './persist'
import { demoProject } from './fixtures'
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
  const [s1, s2] = p.slots.map((s) => s.id)
  p = cycleScore(p, 'dm', b, x)
  p = { ...p, meetings: [{ team: b, dm: x, slot: s1 }, { team: a, dm: x, slot: s2 }] }
  p = withParticipants(p, ['A'], ['X'])
  expect(p.dmScores).toEqual({})
  expect(p.meetings).toEqual([{ team: a, dm: x, slot: s2 }])
})

test('slots keep their ids when the count changes; meetings in dropped slots go', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X'])
  expect(p.slots).toHaveLength(10)
  const ids = p.slots.map((s) => s.id)
  expect(new Set(ids).size).toBe(10)
  p = { ...p, meetings: [{ team: p.teams[0].id, dm: p.dms[0].id, slot: ids[5] }] }

  p = withSlots(p, 3, ['09:00'])
  expect(p.slots.map((s) => s.id)).toEqual(ids.slice(0, 3))
  expect(p.meetings).toEqual([])
  expect(slotLabel(p, ids[0])).toBe('09:00')
  expect(slotLabel(p, ids[2])).toBe('Slot 3')

  // Growing again appends fresh ids rather than reviving old ones.
  p = withSlotCount(p, 4)
  expect(p.slots.slice(0, 3).map((s) => s.id)).toEqual(ids.slice(0, 3))
  expect(ids).not.toContain(p.slots[3].id)

  expect(withSlots(p, 0, []).slots).toHaveLength(1)
  expect(withSlots(p, 'abc', []).slots).toHaveLength(1)
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
  expect(JSON.parse(serialize(p)).version).toBe(3)
})

test('deserialize reads v2 files (slotCount + slotLabels, meetings by slot position)', () => {
  const v2 = {
    version: 2,
    teams: [{ id: 't1', name: 'Team A' }],
    dms: [{ id: 'd2', name: 'DM 1' }],
    slotCount: 3,
    slotLabels: ['09:00', '09:20'],
    dmScores: { 't1|d2': 2 },
    teamScores: {},
    meetings: [{ team: 't1', dm: 'd2', slot: 1 }, { team: 't1', dm: 'd2', slot: 7 }],
    teamFloor: 2,
    nextId: 3,
  }
  const p = deserialize(JSON.stringify(v2))
  expect(p.slots.map((s) => s.label)).toEqual(['09:00', '09:20', ''])
  expect(p.meetings).toEqual([{ team: 't1', dm: 'd2', slot: p.slots[1].id }])
  expect(p.teamFloor).toBe(2)
  expect(p.dmScores['t1|d2']).toBe(2)
  // Slot ids come from the same counter as everything else and don't collide.
  expect(new Set([...p.teams, ...p.dms, ...p.slots].map((x) => x.id)).size).toBe(5)
  expect(p.nextId).toBe(6)
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
  const [s1] = p.slots.map((s) => s.id)
  expect(p.dmScores[pairKey(a, d2)]).toBe(3)
  expect(p.dmScores[pairKey(b, d1)]).toBe(1)
  expect(p.teamScores[pairKey(b, d2)]).toBe(2)
  expect(p.meetings).toEqual([
    { team: b, dm: d1, slot: s1 },
    { team: a, dm: d2, slot: s1 },
  ])
  expect(p.slots[1].label).toBe('09:20')
})

test('deserialize rejects junk', () => {
  expect(() => deserialize('{"hello":1}')).toThrow(/Not a Meeting Board/)
  expect(() => deserialize('[]')).toThrow(/Not a Meeting Board/)
})
