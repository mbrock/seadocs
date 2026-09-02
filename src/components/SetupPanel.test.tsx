import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withParticipants } from '../lib/project'
import { SetupPanel } from './SetupPanel'

test('Setup uses one editable participant and request matrix', () => {
  const project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).toContain('aria-label="team 1"')
  expect(html).toContain('aria-label="DM 1"')
  expect(html).toContain('-rotate-[22deg]')
  expect(html).toContain('DM request: Fund X asks for Alpha')
  expect(html).toContain('Team request: Alpha asks for Fund X')
  expect(html).toContain('+ film team')
  expect(html).toContain('+ DM')
  expect(html).not.toContain('Move up')
  expect(html).not.toContain('Random 26')
})
