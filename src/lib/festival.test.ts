import { expect, test } from 'vitest'
import * as api from 'cpsat-js/portable'
import { DAY_INDICES, emptyFestival, festivalFromProject, festivalProject, quarterHourSlots, withFestivalDay } from './festival'
import { deserializeFestival, serializeFestival } from './festivalPersist'
import { withDaySetup } from './setup'
import { rosterText, withAsk, withAvailability, withMeetings, withRosterLine, withoutParticipant } from './project'
import { serialize } from './persist'
import { festivalSchedule } from './participantExport'
import { solveWithCpSat } from './cpsatModel'
import { validateAdvancedBoard } from './advancedSolver'
import { commit, initialHistory, undo } from './history'

function twoDays() {
  let festival = emptyFestival()
  for (const day of DAY_INDICES) {
    let p = withDaySetup(festivalProject(festival, day), `Festival · ${day + 1}`, `Film ${day + 1}`, 'Buyer A\nBuyer B', quarterHourSlots('10:00', 3).join('\n'))
    p = withAsk(p, 'dm', p.teams[0].id, p.dms[0].id, true)
    p = withMeetings(p, [{ team: p.teams[0].id, dm: p.dms[0].id, slot: p.slots[0].id }])
    festival = withFestivalDay(festival, day, p)
  }
  return festival
}

test('one shared roster; renames preserve both boards and availability is independent', () => {
  const original = twoDays()
  const p = festivalProject(original, 0)
  const renamed = withFestivalDay(original, 0, withRosterLine(p, 'dm', p.dms[0].id, 'New buyer'))
  expect(festivalProject(renamed, 1).dms[0].name).toBe('New buyer')
  expect(renamed.days.map((d) => d.meetings)).toEqual(original.days.map((d) => d.meetings))
  const away = withFestivalDay(original, 0, withAvailability(p, p.dms[0].id, p.slots[0].id, false))
  expect(away.days[0].meetings).toEqual([])
  expect(away.days[1]).toBe(original.days[1])
  expect(festivalProject(away, 1).dms[0].unavailable).toBeUndefined()
  expect(undo(commit(initialHistory(original), away)).present).toBe(original)
})

test('removing a shared DM prunes both days, without removing other participants', () => {
  const original = twoDays()
  const p = festivalProject(original, 1)
  const next = withFestivalDay(original, 1, withoutParticipant(p, 'dm', p.dms[0].id))
  expect(next.days.every((d) => d.meetings.length === 0 && Object.keys(d.dmAsks).length === 0)).toBe(true)
  expect(next.days.map((d) => d.teams)).toEqual(original.days.map((d) => d.teams))
})

test('v6 round trip preserves both days, separate availability and shared roster', () => {
  let f = twoDays()
  const p = festivalProject(f, 1)
  f = withFestivalDay(f, 1, withAvailability(p, p.dms[1].id, p.slots[1].id, false))
  expect(deserializeFestival(serializeFestival(f))).toEqual(f)
  expect(JSON.parse(serializeFestival(f)).days[0].dms).toBeUndefined()
})

test('old files become Day 1 without altering meetings, times, or availability', () => {
  const p = festivalProject(twoDays(), 0)
  const away = withAvailability(p, p.dms[1].id, p.slots[2].id, false)
  const f = deserializeFestival(serialize(away))
  expect(f.days[0].meetings).toEqual(away.meetings)
  expect(f.days[0].slots).toEqual(away.slots)
  expect(festivalProject(f, 0).dms).toEqual(away.dms)
  expect(f.days[1].teams).toEqual([])
  expect(f.days[1].meetings).toEqual([])
  expect(festivalProject(f, 1).dms.every((d) => !d.unavailable)).toBe(true)
  expect(festivalFromProject(away)).toEqual(f)
})

test('rejects malformed festivals and dangling references rather than silently dropping data', () => {
  const text = serializeFestival(twoDays())
  const corruptions = [
    (f: ReturnType<typeof twoDays>) => { f.days.pop() },
    (f: ReturnType<typeof twoDays>) => { f.dms.push(f.dms[0]) },
    (f: ReturnType<typeof twoDays>) => { f.days[1].meetings[0].dm = 'missing' },
    (f: ReturnType<typeof twoDays>) => { f.days[1].dmUnavailable.unknown = ['missing'] },
    (f: ReturnType<typeof twoDays>) => { f.days[1].slots = [] },
    (f: ReturnType<typeof twoDays>) => { f.days[0].dmAsks['missing|missing'] = true },
  ]
  for (const corrupt of corruptions) {
    const file = JSON.parse(text)
    corrupt(file)
    expect(() => deserializeFestival(JSON.stringify(file))).toThrow()
  }
})

test.each(DAY_INDICES)('participant exports include only the selected day (%s)', (day) => {
  const f = twoDays()
  const other = day === 0 ? 2 : 1
  const dm = festivalSchedule(f, day, 'dm', f.dms[0].id).join('\n')
  expect(dm).toContain(`Day ${day + 1} · Festival · ${day + 1}`)
  expect(dm).toContain(`Film ${day + 1}`)
  expect(dm).not.toContain(`Film ${other}`)
  expect(dm).not.toContain(`Day ${other}`)
  const team = festivalSchedule(f, day, 'team', f.days[day].teams[0].id).join('\n')
  expect(team).toContain(`Day ${day + 1}`)
  expect(team).not.toContain(`Day ${other}`)
})

test('15-minute generator handles hour boundaries and rejects invalid ranges', () => {
  expect(quarterHourSlots('10:45', 2)).toEqual(['10:45–11:00', '11:00–11:15'])
  expect(quarterHourSlots('23:45', 1)).toEqual(['23:45–24:00'])
  for (const [start, count] of [['23:45', 2], ['25:00', 1], ['09:00', 0], ['09:00', 61]] as const) expect(quarterHourSlots(start, count)).toEqual([])
})

test('27 decision makers and 13 teams can solve each day independently in 15-minute slots', async () => {
  let f = emptyFestival()
  const names = Array.from({ length: 27 }, (_, i) => `Buyer ${i + 1}`).join('\n')
  for (const day of DAY_INDICES) {
    const p = withDaySetup(festivalProject(f, day), `Day ${day + 1}`, Array.from({ length: 13 }, (_, i) => `Day ${day + 1} Film ${i + 1}`).join('\n'), names, quarterHourSlots('15:00', 12).join('\n'))
    f = withFestivalDay(f, day, p)
  }
  for (const day of DAY_INDICES) {
    const other = f.days[day === 0 ? 1 : 0]
    const p = festivalProject(f, day)
    expect(rosterText(p.dms)).toBe(names)
    const result = await solveWithCpSat(api, { ...p, currentBoard: [], fallbackHint: [] })
    expect(['optimal', 'feasible']).toContain(result.kind)
    expect(result.meetings?.length).toBeGreaterThan(0)
    expect(validateAdvancedBoard(p, result.meetings ?? [])).toEqual([])
    f = withFestivalDay(f, day, withMeetings(p, result.meetings ?? []))
    expect(f.days[day === 0 ? 1 : 0]).toBe(other)
  }
}, 30000)
