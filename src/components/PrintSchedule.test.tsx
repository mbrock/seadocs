import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { delayTimes, emptyProject, withAvailability, withMeetings, withParticipants, withSlots } from '../lib/project'
import { PrintSchedule } from './PrintSchedule'

test('organizer print includes full names, delayed slots and availability once per DM per slot', () => {
  let p = withSlots(withParticipants(emptyProject(), ['A Very Long Film Title'], ['Buyer One', 'Buyer Two']), ['15:00–15:15', '15:15–15:30'])
  p = withAvailability(p, p.dms[1].id, p.slots[0].id, false)
  p = withMeetings(p, [{ team: p.teams[0].id, dm: p.dms[0].id, slot: p.slots[0].id }])
  const html = renderToStaticMarkup(<PrintSchedule project={delayTimes(p, 20)} day={1} />)
  expect(html).toContain('Day 2')
  expect(html).not.toContain('Day 1')
  expect(html).toContain('15:20–15:35')
  expect(html).toContain('A Very Long Film Title')
  expect(html.match(/Buyer One/g)).toHaveLength(2)
  expect(html).toContain('— Unavailable')
  expect(html).toContain('— Free')
  expect(html).not.toContain('<button')
})

test('an empty schedule is explicitly labelled', () => {
  const html = renderToStaticMarkup(<PrintSchedule project={emptyProject()} day={0} />)
  expect(html).toContain('No meetings scheduled.')
})

test('compact layout splits wide schedules into labelled blocks and repeats participants', () => {
  const p = withSlots(withParticipants(emptyProject(), ['Film'], ['Buyer']), Array.from({ length: 25 }, (_, i) => `Time ${i + 1}`))
  const html = renderToStaticMarkup(<PrintSchedule project={p} day={1} compact />)
  expect(html.match(/<table>/g)).toHaveLength(3)
  expect(html.match(/>Buyer</g)).toHaveLength(3)
  for (const n of [1, 12, 13, 24, 25]) expect(html).toContain(`>Time ${n}<`)
  expect(html).toContain('Time block 3/3')
  expect(html).toContain('print-compact')
  expect(html).not.toContain('Day 1')
})
