import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withAsk, withMeetings, withParticipants } from '../lib/project'
import { SetupPanel } from './SetupPanel'

test('Setup uses separate request matrices with editable row names', () => {
  const project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).toContain('aria-label="team 1"')
  expect(html).toContain('aria-label="DM 1"')
  expect(html.match(/aria-label="team 1"/g)).toHaveLength(1)
  expect(html.match(/aria-label="DM 1"/g)).toHaveLength(1)
  expect(html).toContain('-rotate-45')
  expect(html).toContain('DM request: Fund X asks for Alpha')
  expect(html).toContain('Team request: Alpha asks for Fund X')
  expect(html).toContain('+ film team')
  expect(html).toContain('+ DM')
  expect(html.match(/<tr/g)).toHaveLength(4)
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

test('request color and opacity reflect the current schedule', () => {
  let project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  project = withAsk(project, 'dm', project.teams[0].id, project.dms[0].id, true)
  project = withMeetings(project, [{ team: project.teams[0].id, dm: project.dms[0].id, slot: project.slots[0].id }])

  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).toContain('aria-checked="true"')
  expect(html).toContain('bg-request-dm')
  expect(html).not.toContain('opacity-45')
  expect(html).not.toContain('<svg')
})

test('both matrices show the combined two-sided request state', () => {
  let project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  project = withAsk(project, 'dm', project.teams[0].id, project.dms[0].id, true)
  project = withAsk(project, 'team', project.teams[0].id, project.dms[0].id, true)

  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html.match(/linear-gradient/g)).toHaveLength(2)
  expect(html.match(/opacity-45/g)).toHaveLength(2)
})

test('film-team rows use board codes while retaining the full title', () => {
  const project = withParticipants(emptyProject(), ['The Crust of Europe'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).toContain('title="The Crust of Europe"')
  expect(html).toContain('>Europe</span>')
})
