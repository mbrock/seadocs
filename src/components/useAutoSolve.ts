import { useEffect, useEffectEvent, useState } from 'react'
import { validateAdvancedBoard, type SolverStatusInfo } from '../lib/advancedSolver'
import { startAdvancedSolve } from '../lib/advancedSolverClient'
import { optimize } from '../lib/optimize'
import { hasAsks, type Project } from '../lib/project'
import type { PlacedMeeting } from '../lib/scheduler'

/** Everything the solver reads; the board itself is only a stability hint and is not part of the key. */
function solveKey({ teams, dms, dmAsks, teamAsks, slots }: Project): string {
  return JSON.stringify([
    teams.map(({ id, unavailable }) => [id, unavailable]),
    dms.map(({ id, unavailable }) => [id, unavailable]),
    Object.keys(dmAsks).sort(),
    Object.keys(teamAsks).sort(),
    slots.map(({ id }) => id),
  ])
}

const solvable = (project: Project) => project.teams.length > 0 && project.dms.length > 0 && hasAsks(project)

const LOADING: SolverStatusInfo = { state: 'loading', elapsedMs: 0, totalPhases: 7 }

/** The latest status of the solve for `key`; a solve that has not reported yet is loading. */
interface Report {
  key: string
  status: SolverStatusInfo | null
}

export function useAutoSolve(project: Project, onSolved: (meetings: PlacedMeeting[]) => void): SolverStatusInfo | null {
  const [report, setReport] = useState<Report>({ key: '', status: null })
  const key = solveKey(project)

  const solve = useEffectEvent(() => {
    if (!solvable(project)) {
      if (project.meetings.length) onSolved([])
      return
    }
    const { teams, dms, dmAsks, teamAsks, slots, meetings } = project
    const input = { teams, dms, dmAsks, teamAsks, slots }
    const fallbackHint = optimize(input)[0]?.meetings ?? []
    const setStatus = (status: SolverStatusInfo | null) => setReport({ key, status })
    const finish = (board: PlacedMeeting[]) => {
      onSolved(board)
      setStatus(null)
    }
    const fallBack = (reason: string) => {
      console.warn(`[CP-SAT] fallback schedule used · ${reason}`)
      finish(fallbackHint)
    }
    return startAdvancedSolve(
      { ...input, currentBoard: meetings, fallbackHint },
      (result) => {
        if (!result.meetings || (result.kind !== 'optimal' && result.kind !== 'feasible')) {
          return fallBack(result.message ?? 'the local CP-SAT solver returned no valid board')
        }
        const errors = validateAdvancedBoard(input, result.meetings)
        if (errors.length) return fallBack(`the local solver result was rejected (${errors[0]})`)
        finish(result.meetings)
      },
      fallBack,
      setStatus,
    )
  })

  useEffect(() => solve(), [key])

  if (!solvable(project)) return null
  return report.key === key ? report.status : LOADING
}
