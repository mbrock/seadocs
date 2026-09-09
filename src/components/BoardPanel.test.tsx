import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withMeetings, withParticipants } from '../lib/project'
import { BoardPanel } from './BoardPanel'

test('schedule shows full project titles in meeting cells and team row headings, even with a custom code', () => {
  let project = withParticipants(emptyProject(), [{ name: 'The Crust of Europe', code: 'EUROPE', online: false }], ['Fund X'])
  project = withMeetings(project, [{ team: project.teams[0].id, dm: project.dms[0].id, slot: project.slots[0].id }])
  const html = renderToStaticMarkup(<BoardPanel project={project} onChange={() => undefined} onUndo={() => undefined} onRedo={() => undefined} canUndo={false} canRedo={false} />)
  expect(html.match(/>The Crust of Europe<\/span>/g)).toHaveLength(2)
  expect(html).not.toContain('>EUROPE</span>')
  expect(html).toContain('whitespace-normal')
  expect(html).toContain('overflow-wrap:anywhere')
})
