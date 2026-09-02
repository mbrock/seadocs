import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withAsk, withMeetings, withParticipants } from '../lib/project'
import { SetupPanel } from './SetupPanel'

test('Setup uses separate request matrices with editable row names', () => {
  const project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} generating={false} />)

  expect(html).toContain('aria-label="team 1"')
  expect(html).toContain('aria-label="DM 1"')
  expect(html.match(/aria-label="team 1"/g)).toHaveLength(1)
  expect(html.match(/aria-label="DM 1"/g)).toHaveLength(1)
  expect(html).toContain('-rotate-[22deg]')
  expect(html).toContain('DM request: Fund X asks for Alpha')
  expect(html).toContain('Team request: Alpha asks for Fund X')
  expect(html).toContain('+ film team')
  expect(html).toContain('+ DM')
  expect(html).not.toContain('EVENT')
  expect(html).not.toContain('MEETING TIMES')
  expect(html).not.toContain('Load sample day')
  expect(html).not.toContain('Apply edits')
  expect(html).not.toContain('Paste names')
  expect(html).not.toContain('Decision-maker requests')
  expect(html).not.toContain('Team requests')
  expect(html).not.toContain('Clear requests')
  expect(html).not.toContain('Move up')
  expect(html).not.toContain('Random 26')
})

test('request color persists while fulfillment checks disappear during generation', () => {
  let project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  project = withAsk(project, 'dm', project.teams[0].id, project.dms[0].id, true)
  project = withMeetings(project, [{ team: project.teams[0].id, dm: project.dms[0].id, slot: project.slots[0].id }])

  const settled = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} generating={false} />)
  const generating = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} generating />)

  expect(settled).toContain('aria-checked="true"')
  expect(settled).toContain('bg-emerald-600')
  expect(settled).toContain('✓')
  expect(generating).toContain('aria-checked="true"')
  expect(generating).toContain('bg-emerald-600')
  expect(generating).not.toContain('✓')
})
