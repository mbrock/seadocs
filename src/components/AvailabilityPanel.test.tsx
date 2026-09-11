import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { emptyProject, withAvailability, withParticipants, withSlots } from '../lib/project'
import { AvailabilityPanel } from './AvailabilityPanel'

test('availability grid defaults to available and reflects existing blocked slots', () => {
  let project = withSlots(withParticipants(emptyProject(), ['Film'], ['Buyer']), ['15:00', '15:15', '15:30', '15:45'])
  const render = () => renderToStaticMarkup(<AvailabilityPanel project={project} onChange={() => undefined} />)
  expect(render().match(/checked=""/g)).toHaveLength(4)
  project = withAvailability(project, project.dms[0].id, project.slots[3].id, false)
  expect(render().match(/checked=""/g)).toHaveLength(3)
  expect(render()).toContain('Buyer available at 15:45')
  expect(render()).toContain('hatched')
})
