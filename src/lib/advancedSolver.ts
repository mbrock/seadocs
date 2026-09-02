import { availabilityOf, findIssues, pairKey, type PlacedMeeting, type ScheduleInput } from './scheduler'

export const ADVANCED_POLICY_VERSION = 'local-cpsat-v1'

export interface AdvancedSolverInput extends ScheduleInput {
  /** The board on screen is a stability target, never an implicit lock. */
  currentBoard: PlacedMeeting[]
  /** A valid board from the fast JavaScript scheduler, used only as a search hint. */
  fallbackHint: PlacedMeeting[]
  maxTimeMs?: number
}

export type AdvancedResultKind = 'optimal' | 'feasible' | 'infeasible' | 'failed'

export interface SolverPhase {
  name: 'mutual requests' | 'DM requests' | 'teams served' | 'team requests' | 'DM gaps' | 'total meetings' | 'stability'
  status: 'optimal' | 'feasible' | 'no incumbent'
  value?: number
  bound?: number
}

export interface AdvancedSolverResult {
  kind: AdvancedResultKind
  meetings?: PlacedMeeting[]
  phases: SolverPhase[]
  runtimeMs: number
  message?: string
  solver: { package: 'cpsat-js'; version: '1.3.0'; variant: 'portable'; policy: string }
}

export interface SolveRequest {
  type: 'solve'
  runId: number
  input: AdvancedSolverInput
}

export interface SolveResponse {
  type: 'result'
  runId: number
  result: AdvancedSolverResult
}

/** Independent ordinary-TypeScript validation; no solver state is trusted. */
export function validateAdvancedBoard(input: ScheduleInput, meetings: PlacedMeeting[]): string[] {
  const errors: string[] = []
  const teams = new Set(input.teams.map((p) => p.id))
  const dms = new Set(input.dms.map((p) => p.id))
  const slots = new Set(input.slots.map((s) => s.id))
  const available = availabilityOf([...input.teams, ...input.dms])
  for (const m of meetings) {
    if (!teams.has(m.team)) errors.push(`Unknown team ${m.team}`)
    if (!dms.has(m.dm)) errors.push(`Unknown decision maker ${m.dm}`)
    if (!slots.has(m.slot)) errors.push(`Unknown slot ${m.slot}`)
  }
  if (errors.length === 0) {
    for (const issue of findIssues(meetings, available)) errors.push(`Invalid meeting: ${issue.type}`)
  }
  return errors
}

export interface AdvancedMetrics {
  mutual: number
  dmRequested: number
  teamsServed: number
  teamRequested: number
  total: number
  stable: number
}

export function advancedMetrics(input: AdvancedSolverInput, meetings: PlacedMeeting[]): AdvancedMetrics {
  const current = new Set(input.currentBoard.map((m) => `${m.slot}|${pairKey(m.team, m.dm)}`))
  const teams = new Set<string>()
  let mutual = 0
  let dmRequested = 0
  let teamRequested = 0
  let stable = 0
  for (const m of meetings) {
    const key = pairKey(m.team, m.dm)
    const dm = key in input.dmAsks
    const team = key in input.teamAsks
    if (dm && team) mutual++
    if (dm) dmRequested++
    if (team) teamRequested++
    if (current.has(`${m.slot}|${key}`)) stable++
    teams.add(m.team)
  }
  return { mutual, dmRequested, teamsServed: teams.size, teamRequested, total: meetings.length, stable }
}

export function isSolveResponse(value: unknown): value is SolveResponse {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SolveResponse>
  return v.type === 'result' && Number.isInteger(v.runId) && !!v.result && typeof v.result === 'object'
}
