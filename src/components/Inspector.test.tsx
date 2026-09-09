import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withAvailability, withMeetings, withParticipants, type Project } from '../lib/project'
import { Inspector } from './Inspector'

const noop = () => undefined
const render = (project: Project) => renderToStaticMarkup(<Inspector project={project}
  cell={{ side: 'dm', anchor: project.dms[0].id, slot: project.slots[0].id }}
  onChange={noop} onClose={noop} onSelectSlot={noop} onUndo={noop} onRedo={noop} canUndo canRedo={false} />)

test('editor exposes removal, search, full names and history for an unrequested meeting', () => {
  let project = withParticipants(emptyProject(), ['The Northern Shore', 'Evening School'], ['Decision maker'])
  project = withMeetings(project, [{ team: project.teams[0].id, dm: project.dms[0].id, slot: project.slots[0].id }])
  const html = render(project)
  for (const text of ['Remove meeting', 'The Northern Shore', 'Evening School', 'Search film teams', 'Move this meeting', 'Undo', 'Redo']) expect(html).toContain(text)
  expect(html).not.toContain('Apply swap')
})

test('empty editor lists repeated and unavailable candidates with reasons', () => {
  let project = withParticipants(emptyProject(), ['Already meeting', 'Away film'], ['Decision maker'])
  project = withMeetings(project, [{ team: project.teams[0].id, dm: project.dms[0].id, slot: project.slots[1].id }])
  project = withAvailability(project, project.teams[1].id, project.slots[0].id, false)
  const html = render(project)
  expect(html).toContain('Empty slot')
  expect(html).toContain('Would repeat')
  expect(html).toContain('is unavailable at this time')
  expect(html.match(/disabled="" aria-pressed="false"/g)).toHaveLength(2)
  expect(html).not.toContain('Remove meeting')
})

test('unavailable editor offers restoration rather than booking', () => {
  let project = withParticipants(emptyProject(), ['Film'], ['Decision maker'])
  project = withAvailability(project, project.dms[0].id, project.slots[0].id, false)
  const html = render(project)
  expect(html).toContain('Available again')
  expect(html).not.toContain('Search film teams')
})
