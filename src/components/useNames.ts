import { useMemo } from 'react'
import { displayNames, type DisplayName } from '../lib/names'
import type { Project } from '../lib/project'
import type { Id, Side } from '../lib/scheduler'

/** Everything the components show for one participant. */
export interface ParticipantName extends DisplayName {
  id: Id
  /** The full name as entered, for tooltips and headings. */
  name: string
  side: Side
}

export type Names = (id: Id) => ParticipantName

/** Teams are set in italics wherever they appear next to decision makers. */
export const sideStyle: Record<Side, string> = { team: 'italic', dm: '' }

/** Display names for everyone in the project, recomputed only when the rosters change. */
export function useNames(project: Project): Names {
  return useMemo(() => {
    const display = displayNames([...project.teams, ...project.dms])
    const byId = new Map<Id, ParticipantName>()
    for (const p of project.teams) byId.set(p.id, { ...display.get(p.id)!, id: p.id, name: p.name, side: 'team' })
    for (const p of project.dms) byId.set(p.id, { ...display.get(p.id)!, id: p.id, name: p.name, side: 'dm' })
    return (id) => byId.get(id)!
  }, [project.teams, project.dms])
}
