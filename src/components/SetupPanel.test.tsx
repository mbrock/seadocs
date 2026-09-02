import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withParticipants } from '../lib/project'
import { SetupPanel } from './SetupPanel'

test('unified Setup exposes the people/day and binary request workflow together', () => {
  const project = withParticipants(emptyProject(), ['Alpha'], ['Fund X'])
  const html = renderToStaticMarkup(<SetupPanel project={project} onChange={() => undefined} />)

  expect(html).toContain('1 · People &amp; day')
  expect(html).toContain('2 · Requests')
  expect(html).toContain('Teams · 1')
  expect(html).toContain('Decision makers · 1')
  expect(html).toContain('aria-label="team 1"')
  expect(html).toContain('aria-label="DM 1"')
  expect(html).toContain('Paste a list to add')
  expect(html).toContain('Existing rows are kept')
  expect(html).toContain('DM interest: Fund X asks for Alpha')
  expect(html).toContain('Team interest: Alpha asks for Fund X')
})
