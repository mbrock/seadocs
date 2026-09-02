import { test, expect } from 'vitest'
import {
  emptyProject,
  parseNames,
  reconcileParticipants,
  rosterLine,
  withAvailability,
  withNewParticipant,
  withoutParticipant,
  withParticipants,
  withRosterLine,
  withSlots,
  withSlotCount,
  toggleAsk,
  slotLabel,
} from './project'
import { deserialize, serialize } from './persist'
import { demoProject } from './fixtures'
import { pairKey } from './scheduler'
import { commit, initialHistory, undo } from './history'

test('parseNames trims, drops blanks and duplicates', () => {
  expect(parseNames(' A \n\nB\nA\n  ')).toEqual(['A', 'B'])
})

test('withParticipants keeps ids for names that survive, so asks survive too', () => {
  let p = withParticipants(emptyProject(), ['Alpha', 'Beta'], ['Fund X'])
  const alpha = p.teams[0].id
  const fund = p.dms[0].id
  p = toggleAsk(p, 'dm', alpha, fund)
  expect(p.dmAsks[pairKey(alpha, fund)]).toBe(true)

  // Remove Beta, add Gamma, reorder: Alpha keeps its id and ask.
  p = withParticipants(p, ['Gamma', 'Alpha'], ['Fund X'])
  expect(p.teams[1].id).toBe(alpha)
  expect(p.dmAsks[pairKey(alpha, fund)]).toBe(true)
  expect(p.teams[0].id).not.toBe(alpha)
  expect(p.teams).toHaveLength(2)
})

test('identity-bearing rows preserve links across simultaneous renames and reordering', () => {
  let p = withParticipants(emptyProject(), ['Alpha', 'Beta'], ['Fund X', 'Fund Y'])
  const alpha = p.teams[0].id
  const fund = p.dms[0].id
  const slot = p.slots[0].id
  p = toggleAsk(toggleAsk(p, 'dm', alpha, fund), 'team', alpha, fund)
  p = withAvailability(p, alpha, slot, false)
  p = { ...p, meetings: [{ team: alpha, dm: fund, slot: p.slots[1].id }] }

  p = withParticipants(
    p,
    [{ id: p.teams[1].id, name: 'Beta renamed', online: false }, { id: alpha, name: 'Alpha renamed', online: false }],
    [{ id: p.dms[1].id, name: 'Fund Y renamed', online: false }, { id: fund, name: 'Fund X renamed', online: false }],
    true,
  )
  expect(p.teams[1]).toMatchObject({ id: alpha, name: 'Alpha renamed', unavailable: [slot] })
  expect(p.dms[1].id).toBe(fund)
  expect(p.dmAsks[pairKey(alpha, fund)]).toBe(true)
  expect(p.teamAsks[pairKey(alpha, fund)]).toBe(true)
  expect(p.meetings).toEqual([{ team: alpha, dm: fund, slot: p.slots[1].id }])
})

test('explicit delete and add do not transfer the deleted participant identity', () => {
  let p = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const alpha = p.teams[0].id
  const fund = p.dms[0]
  p = toggleAsk(p, 'dm', alpha, fund.id)
  p = withParticipants(p, [{ name: 'Replacement', online: false }], [{ id: fund.id, name: fund.name, online: false }], true)
  expect(p.teams[0].id).not.toBe(alpha)
  expect(p.dmAsks).toEqual({})
})

test('ambiguous pasted roster replacement is blocked rather than guessed', () => {
  const p = withParticipants(emptyProject(), ['Alpha', 'Beta'], ['Fund X'])
  const preview = reconcileParticipants(p, ['Gamma', 'Delta'], ['Fund X'])
  expect(preview.ambiguous).toEqual([{ side: 'team', oldNames: ['Alpha', 'Beta'], newNames: ['Gamma', 'Delta'] }])
  expect(() => withParticipants(p, ['Gamma', 'Delta'], ['Fund X'])).toThrow(/Ambiguous roster edit/)
})

test('withParticipants prunes asks and meetings for removed people', () => {
  let p = withParticipants(emptyProject(), ['A', 'B'], ['X'])
  const [a, b] = p.teams.map((t) => t.id)
  const x = p.dms[0].id
  const [s1, s2] = p.slots.map((s) => s.id)
  p = toggleAsk(p, 'dm', b, x)
  p = { ...p, meetings: [{ team: b, dm: x, slot: s1 }, { team: a, dm: x, slot: s2 }] }
  p = withParticipants(p, ['A'], ['X'])
  expect(p.dmAsks).toEqual({})
  expect(p.meetings).toEqual([{ team: a, dm: x, slot: s2 }])
})

test('participant deletion previews linked data loss, applies it, and is undoable', () => {
  let p = withParticipants(emptyProject(), ['A', 'B'], ['X'])
  const b = p.teams[1].id
  const x = p.dms[0].id
  const slot = p.slots[0].id
  p = toggleAsk(toggleAsk(p, 'dm', b, x), 'team', b, x)
  p = withAvailability(p, b, slot, false)
  p = { ...p, meetings: [{ team: b, dm: x, slot: p.slots[1].id }] }
  const preview = reconcileParticipants(p, ['A'], ['X'])
  expect(preview.removed).toEqual({ participants: 1, dmAsks: 1, teamAsks: 1, meetings: 1, availability: 1 })

  const history = commit(initialHistory(p), withParticipants(p, ['A'], ['X']))
  expect(history.present.dmAsks).toEqual({})
  expect(history.present.meetings).toEqual([])
  expect(undo(history).present).toEqual(p)
})

test('slots keep their ids when the count changes; meetings in dropped slots go', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X'])
  expect(p.slots).toHaveLength(10)
  const ids = p.slots.map((s) => s.id)
  expect(new Set(ids).size).toBe(10)
  p = { ...p, meetings: [{ team: p.teams[0].id, dm: p.dms[0].id, slot: ids[5] }] }

  p = withSlots(p, ['09:00', '', ''])
  expect(p.slots.map((s) => s.id)).toEqual(ids.slice(0, 3))
  expect(p.meetings).toEqual([])
  expect(slotLabel(p, ids[0])).toBe('09:00')
  expect(slotLabel(p, ids[2])).toBe('Slot 3')

  // Growing again appends fresh ids rather than reviving old ones.
  p = withSlotCount(p, 4)
  expect(p.slots.slice(0, 3).map((s) => s.id)).toEqual(ids.slice(0, 3))
  expect(ids).not.toContain(p.slots[3].id)

  expect(withSlots(p, []).slots).toHaveLength(1)
})

test('toggleAsk switches an ask on and off, leaving no entry when off', () => {
  let p = withParticipants(emptyProject(), ['A'], ['X'])
  const k = pairKey(p.teams[0].id, p.dms[0].id)
  p = toggleAsk(p, 'team', p.teams[0].id, p.dms[0].id)
  expect(p.teamAsks[k]).toBe(true)
  p = toggleAsk(p, 'team', p.teams[0].id, p.dms[0].id)
  expect(k in p.teamAsks).toBe(false)
})

test('serialize/deserialize round-trips', () => {
  const p = demoProject(3)
  const back = deserialize(serialize(p))
  expect(back).toEqual(p)
  expect(JSON.parse(serialize(p)).version).toBe(5)
})

test('deserialize migrates v4 stable identities and repairs a stale id counter', () => {
  const v4 = {
    version: 4,
    teams: [{ id: 't40', name: 'Alpha', unavailable: ['s42'] }],
    dms: [{ id: 'd41', name: 'Fund' }],
    slots: [{ id: 's42', label: '09:00' }],
    dmAsks: ['t40|d41'],
    teamAsks: ['t40|d41'],
    meetings: [{ team: 't40', dm: 'd41', slot: 's42' }],
    nextId: 2,
  }
  const p = deserialize(JSON.stringify(v4))
  expect(p).toMatchObject({ nextId: 43, dmAsks: { 't40|d41': true }, teamAsks: { 't40|d41': true } })
  expect(p.meetings).toEqual(v4.meetings)
  expect(p.teams[0].unavailable).toEqual(['s42'])
})

test('deserialize rejects ambiguous or dangling current-format identities', () => {
  const base = {
    version: 5,
    teams: [{ id: 'p1', name: 'Alpha' }],
    dms: [{ id: 'p1', name: 'Fund' }],
    slots: [{ id: 's2', label: '' }],
    dmAsks: [], teamAsks: [], meetings: [], nextId: 3,
  }
  expect(() => deserialize(JSON.stringify(base))).toThrow(/duplicate.*identit/i)
  expect(() => deserialize(JSON.stringify({ ...base, dms: [{ id: 'd2', name: 'Fund' }], dmAsks: ['missing|d2'] }))).toThrow(/requests for missing/i)
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
  expect(p.dmAsks['t1|d2']).toBe(true)
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
  expect(p.dmAsks[pairKey(a, d2)]).toBe(true)
  expect(p.dmAsks[pairKey(b, d1)]).toBe(true)
  expect(p.teamAsks[pairKey(b, d2)]).toBe(true)
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

test('roster rows: add, edit the line, delete', () => {
  let p = withNewParticipant(withNewParticipant(emptyProject(), 'dm'), 'team')
  const [dm] = p.dms
  const [team] = p.teams
  expect(dm.name).toBe('')
  expect(dm.id).not.toBe(team.id)

  p = withRosterLine(withAvailability(p, dm.id, p.slots[0].id, false), 'dm', dm.id, 'Ana Ruiz | Fund, Spain = Ruiz *')
  expect(p.dms[0]).toEqual({ id: dm.id, name: 'Ana Ruiz | Fund, Spain', code: 'Ruiz', online: true, unavailable: [p.slots[0].id] })
  expect(rosterLine(p.dms[0])).toBe('Ana Ruiz | Fund, Spain = Ruiz *')

  p = toggleAsk(p, 'dm', team.id, dm.id)
  p = withoutParticipant(p, 'team', team.id)
  expect(p.teams).toEqual([])
  expect(p.dmAsks).toEqual({})
})
