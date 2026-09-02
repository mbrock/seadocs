// Tie the optimizer to the project model and remember what it was run on.

import { optimize, type Alternative } from './optimize'
import type { Project } from './project'

/** The frontier plus the inputs it was computed from, so callers can tell when it is stale. */
export interface Generated {
  alternatives: Alternative[]
  input: Pick<Project, 'teams' | 'dms' | 'dmScores' | 'teamScores' | 'slots' | 'teamFloor'>
}

export function generate(project: Project): Generated {
  const { teams, dms, dmScores, teamScores, slots, teamFloor } = project
  return { alternatives: optimize(project), input: { teams, dms, dmScores, teamScores, slots, teamFloor } }
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
    i.slots === project.slots &&
    i.teamFloor === project.teamFloor
  )
}
