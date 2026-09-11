import { availabilityOfProject, slotLabel, withAvailability, type Project } from '../lib/project'
import { Name, type UpdateProject } from './ui'
import { useNames } from './useNames'

export function AvailabilityPanel({ project, onChange }: { project: Project; onChange: UpdateProject }) {
  const names = useNames(project)
  const available = availabilityOfProject(project)
  return <section className="my-5 w-full">
    <h2 className="font-bold">Decision-maker availability</h2>
    <p className="mb-2 text-muted">Checked = available. Uncheck times someone cannot attend on this day. Any meeting in an unchecked slot is removed; other meetings stay put. Rebuild respects these limits. Undo restores changes.</p>
    <div className="max-h-[60vh] overflow-auto">
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead><tr>
          <th className="sticky top-0 left-0 z-30 bg-paper p-2 text-left">Decision maker</th>
          {project.slots.map((slot) => <th key={slot.id} scope="col" className="sticky top-0 z-20 bg-paper px-2 py-1 font-mono font-normal whitespace-nowrap">{slotLabel(project, slot.id)}</th>)}
        </tr></thead>
        <tbody>{project.dms.map((dm, i) => <tr key={dm.id} className={i % 2 === 0 ? 'bg-stripe' : 'bg-paper'}>
          <th scope="row" className={`sticky left-0 z-10 px-2 py-1 text-left ${i % 2 === 0 ? 'bg-stripe' : 'bg-paper'}`}><Name who={names(dm.id)} variant="short" /></th>
          {project.slots.map((slot) => <td key={slot.id} className={available(dm.id, slot.id) ? '' : 'hatched'}>
            <label className="flex min-h-8 cursor-pointer items-center justify-center px-3 py-2">
              <input type="checkbox" aria-label={`${dm.name} available at ${slotLabel(project, slot.id)}`} checked={available(dm.id, slot.id)} onChange={(e) => {
                const checked = e.target.checked
                onChange((p) => withAvailability(p, dm.id, slot.id, checked))
              }} />
            </label>
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!project.dms.length && <p className="text-muted">Add decision makers in Edit setup first.</p>}
  </section>
}
