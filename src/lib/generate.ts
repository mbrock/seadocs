// Tie the optimizer to the project model and remember what it was run on.

import { optimize, type Alternative } from './optimize'
import type { Project } from './state'

/** The frontier plus the inputs it was computed from, so callers can tell when it is stale. */
export interface Generated {
  alternatives: Alternative[]
  input: Pick<Project, 'teams' | 'dms' | 'dmScores' | 'teamScores' | 'slotCount' | 'teamFloor'>
}

export function generate(project: Project): Generated {
  const { teams, dms, dmScores, teamScores, slotCount, teamFloor } = project
  return { alternatives: optimize(project), input: { teams, dms, dmScores, teamScores, slotCount, teamFloor } }
}

/** True when nothing the frontier depends on has changed since it was generated. */
export function isFresh(generated: Generated | null, project: Project): generated is Generated {
  if (!generated) return false
  const i = generated.input
  return (
    i.teams === project.teams &&
    i.dms === project.dms &&
    i.dmScores === project.dmScores &&
    i.teamScores === project.teamScores &&
    i.slotCount === project.slotCount &&
    i.teamFloor === project.teamFloor
  )
}
