import { useEffect, useEffectEvent, useState } from 'react'
import { validateAdvancedBoard, type SolverStatusInfo } from '../lib/advancedSolver'
import { startAdvancedSolve } from '../lib/advancedSolverClient'
import { optimize } from '../lib/optimize'
import type { Project } from '../lib/project'
import type { PlacedMeeting } from '../lib/scheduler'

const LOADING: SolverStatusInfo = { state: 'loading', elapsedMs: 0, totalPhases: 7 }

/** The latest status of the solve for `key`; a solve that has not reported yet is loading. */
interface Report {
  key: Project | null
  status: SolverStatusInfo | null
}

/** A non-null snapshot is an explicit build request; clearing it cancels the Worker. */
export function useScheduleSolve(project: Project | null, onSolved: (meetings: PlacedMeeting[]) => void): SolverStatusInfo | null {
  const [report, setReport] = useState<Report>({ key: null, status: null })
  const key = project

  const solve = useEffectEvent(() => {
    if (!project) return
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

  if (!project) return null
  return report.key === key ? report.status : LOADING
}
