import { useMemo } from 'react'
import { displayNames } from '../lib/names'
import type { Project } from '../lib/project'

/** Short display names for everyone in the project, recomputed only when rosters change. */
export function useNames(project: Project) {
  return useMemo(() => displayNames([...project.teams, ...project.dms]), [project.teams, project.dms])
}
