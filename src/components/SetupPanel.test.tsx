import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withAsk, withMeetings, withParticipants } from '../lib/project'
import { SetupPanel } from './SetupPanel'

test('Setup uses separate request matrices with read-only row names', () => {
  const project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).not.toContain('<input')
  expect(html).not.toContain('Delete')
  expect(html.match(/>Alpha<\/span>/g)).toHaveLength(2)
  expect(html).toContain('title="Fund X"')
  expect(html).toContain('-rotate-45')
  expect(html).toContain('DM request: Fund X asks for Alpha')
  expect(html).toContain('Team request: Alpha asks for Fund X')
  expect(html).not.toContain('+ film team')
  expect(html).not.toContain('+ DM')
  expect(html.match(/<tr/g)).toHaveLength(4)
  expect(html).not.toContain('bg-rule')
  expect(html).toContain('outline-rule')
  expect(html).not.toContain('group-hover/matrix:visible')
  expect(html).not.toContain('EVENT')
  expect(html).not.toContain('MEETING TIMES')
  expect(html).not.toContain('Load sample day')
  expect(html).not.toContain('Apply edits')
  expect(html).not.toContain('Paste names')
  expect(html).toContain('Decision-maker requests')
  expect(html).toContain('Film-team requests')
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

  expect(html.match(/bg-request-both/g)).toHaveLength(2)
  expect(html.match(/opacity-45/g)).toHaveLength(2)
})

test('both request matrices display full film titles instead of generated or custom codes', () => {
  const project = withParticipants(emptyProject(), [{ name: 'The Crust of Europe', code: 'EUROPE', online: false }], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html.match(/>The Crust of Europe<\/span>/g)).toHaveLength(2)
  expect(html).not.toContain('>EUROPE</span>')
  expect(html).not.toContain('>Europe</span>')
  expect(html).toContain('margin-right:16.5rem')
  expect(html).toContain('height:16.5rem')
})
