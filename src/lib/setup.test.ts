import { expect, test } from 'vitest'
import { emptyProject, freeSlotsForMeeting, withAsk, withAvailability, withMeetings, withMeetingSlot } from './project'
import { withDaySetup } from './setup'
import { participantSchedule, scheduleRtf } from './participantExport'
import { deserialize, serialize } from './persist'

function day() {
  const p = withDaySetup(emptyProject(), 'Rīga · Day 2', 'Film A\nFilm B', 'Buyer A\nBuyer B', '10:00\n10:20\n10:40')
  return withMeetings(withAsk(p, 'dm', p.teams[0].id, p.dms[0].id, true), [
    { team: p.teams[0].id, dm: p.dms[0].id, slot: p.slots[0].id },
    { team: p.teams[1].id, dm: p.dms[1].id, slot: p.slots[2].id },
  ])
}

test('bulk renames preserve positional IDs, asks, availability and meetings; saved files round trip', () => {
  const p = day()
  const next = withDaySetup(withAvailability(p, p.dms[0].id, p.slots[1].id, false), 'New day', 'Changed A = A *\nChanged B', 'New buyer A\nNew buyer B', '11:00\n11:20\n11:40')
  expect(next.meetings).toEqual(p.meetings)
  expect(next.dmAsks).toEqual(p.dmAsks)
  expect(next.teams.map((t) => t.id)).toEqual(p.teams.map((t) => t.id))
  expect(next.teams[0]).toMatchObject({ name: 'Changed A', code: 'A', online: true })
  expect(next.dms[0].unavailable).toEqual([p.slots[1].id])
  expect(deserialize(serialize(next))).toEqual(next)
})

test('shrinking prunes trailing references and additions get fresh IDs', () => {
  const p = day()
  const next = withDaySetup(p, '', 'One', 'Buyer', '12:00')
  expect(next.meetings).toEqual([p.meetings[0]])
  const more = withDaySetup(next, '', 'One\nTwo', 'Buyer\nOther', '12:00\n12:20')
  expect(more.teams[1].id).not.toBe(p.teams[1].id)
  expect(more.slots[1].id).not.toBe(p.slots[1].id)
  expect(() => withDaySetup(p, '', '', '', '')).toThrow()
  expect(() => withDaySetup(p, '', '', '', Array(61).fill('time').join('\n'))).toThrow()
})

test('individual schedules include only that participant, in slot order, with free and unavailable times', () => {
  const p = day()
  const dm = participantSchedule(withAvailability(p, p.dms[0].id, p.slots[1].id, false), 'dm', p.dms[0].id)
  expect(dm).toEqual(['Rīga · Day 2', 'Buyer A', '', '10:00 — Film A', '10:20 — Not available', '10:40 — Free'])
  expect(participantSchedule(p, 'team', p.teams[0].id)[3]).toBe('10:00 — Buyer A')
})

test('RTF escapes syntax and encodes non-ASCII including surrogate pairs', () => {
  const rtf = scheduleRtf(['Rīga {test} \\', '😀'])
  expect(rtf).toContain('R\\u299?ga \\{test\\} \\\\')
  expect(rtf).toContain('\\u-10179?\\u-8704?')
  expect(rtf).toContain('\\b\\fs28 ')
  expect(rtf.startsWith('{\\rtf1')).toBe(true)
})

test('moving a meeting keeps other meetings intact and refuses busy or unavailable times', () => {
  const p = day()
  const meeting = p.meetings[0]
  const moved = withMeetingSlot(p, meeting, p.slots[1].id)
  expect(moved.meetings).toEqual([{ ...meeting, slot: p.slots[1].id }, p.meetings[1]])
  expect(p.meetings[0].slot).toBe(p.slots[0].id)
  const blocked = withAvailability(p, meeting.dm, p.slots[1].id, false)
  expect(withMeetingSlot(blocked, meeting, p.slots[1].id)).toBe(blocked)
  const busy = withMeetings(p, [...p.meetings, { ...meeting, team: p.teams[1].id, slot: p.slots[1].id }])
  expect(withMeetingSlot(busy, meeting, p.slots[1].id)).toBe(busy)
  expect(freeSlotsForMeeting(blocked, meeting).map((s) => s.id)).toEqual([p.slots[2].id])
  expect(withMeetingSlot(p, meeting, 'missing')).toBe(p)
})
