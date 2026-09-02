import type { BoolVar, CpModel, CpSolver, CpSolverResult, IntVar, LinearExpr } from 'cpsat-js/portable'
import { advancedMetrics, validateAdvancedBoard, ADVANCED_POLICY_VERSION, type AdvancedSolverInput, type AdvancedSolverResult, type SolverPhase } from './advancedSolver'
import { availabilityOf, pairKey, type PlacedMeeting } from './scheduler'

type Api = typeof import('cpsat-js/portable')
type Direction = 'max' | 'min'

interface ModelState {
  model: CpModel
  x: Map<string, BoolVar>
  metrics: Record<'mutual' | 'dmRequested' | 'teamsServed' | 'teamRequested' | 'total' | 'stable' | 'dmGaps', LinearExpr | IntVar>
}

const solutionStatus = (api: Api, result: CpSolverResult) =>
  result.status === api.CpSolverStatus.OPTIMAL ? 'optimal' : result.status === api.CpSolverStatus.FEASIBLE ? 'feasible' : 'no incumbent'

const sum = (api: Api, vars: (LinearExpr | IntVar)[]): LinearExpr =>
  vars.reduce<LinearExpr>((a, v) => a.plus('toLinearExpr' in v ? v.toLinearExpr() : v), api.LinearExpr.fromConstant(0))

function buildModel(api: Api, input: AdvancedSolverInput, phaseB: boolean, floors: Partial<Record<keyof ModelState['metrics'], { direction: Direction; value: number }>>, hint: PlacedMeeting[]): ModelState {
  const model = new api.CpModel()
  const available = availabilityOf([...input.teams, ...input.dms])
  const x = new Map<string, BoolVar>()
  const y = new Map<string, BoolVar>()
  const at = (team: string, dm: string, slot: string) => `${team}|${dm}|${slot}`
  const hinted = new Set(hint.map((m) => at(m.team, m.dm, m.slot)))

  for (const team of input.teams) {
    for (const dm of input.dms) {
      const pair = pairKey(team.id, dm.id)
      const placements: BoolVar[] = []
      for (const slot of input.slots) {
        if (!available(team.id, slot.id) || !available(dm.id, slot.id)) continue
        const key = at(team.id, dm.id, slot.id)
        const v = model.newBoolVar(`x_${key}`)
        x.set(key, v)
        placements.push(v)
        model.addHint(v, hinted.has(key) ? 1 : 0)
      }
      if (!placements.length) continue
      const selected = model.newBoolVar(`y_${pair}`)
      model.add(sum(api, placements).equals(selected.toLinearExpr()))
      y.set(pair, selected)
    }
  }

  for (const team of input.teams) {
    for (const slot of input.slots) {
      const vars = input.dms.map((dm) => x.get(at(team.id, dm.id, slot.id))).filter((v): v is BoolVar => !!v)
      if (vars.length) model.add(sum(api, vars).le(1))
    }
  }
  for (const dm of input.dms) {
    for (const slot of input.slots) {
      const vars = input.teams.map((team) => x.get(at(team.id, dm.id, slot.id))).filter((v): v is BoolVar => !!v)
      if (vars.length) model.add(sum(api, vars).le(1))
    }
    // With binary interest data, one non-DM-requested meeting is the strongest
    // explicit burden guardrail the current app can support without inventing consent.
    const extras = input.teams.map((team) => pairKey(team.id, dm.id)).filter((key) => !(key in input.dmAsks)).map((key) => y.get(key)).filter((v): v is BoolVar => !!v)
    if (extras.length) model.add(sum(api, extras).le(1))
  }

  const pairs = [...y.entries()]
  const mutual = sum(api, pairs.filter(([key]) => key in input.dmAsks && key in input.teamAsks).map(([, v]) => v))
  const dmRequested = sum(api, pairs.filter(([key]) => key in input.dmAsks).map(([, v]) => v))
  const teamRequested = sum(api, pairs.filter(([key]) => key in input.teamAsks).map(([, v]) => v))
  const total = sum(api, pairs.map(([, v]) => v))
  const servedVars: BoolVar[] = []
  for (const team of input.teams) {
    const meetings = input.dms.map((dm) => y.get(pairKey(team.id, dm.id))).filter((v): v is BoolVar => !!v)
    if (!meetings.length) continue
    const served = model.newBoolVar(`served_${team.id}`)
    model.add(sum(api, meetings).ge(served.toLinearExpr()))
    model.add(sum(api, meetings).le(served.times(input.slots.length)))
    servedVars.push(served)
  }
  const teamsServed = sum(api, servedVars)
  const stable = sum(api, input.currentBoard.map((m) => x.get(at(m.team, m.dm, m.slot))).filter((v): v is BoolVar => !!v))
  let dmGaps: LinearExpr | IntVar = api.LinearExpr.fromConstant(0)

  if (phaseB) {
    const gaps: BoolVar[] = []
    for (const dm of input.dms) {
      const occupied: (BoolVar | null)[] = input.slots.map((slot) => {
        if (!available(dm.id, slot.id)) return null
        const vars = input.teams.map((team) => x.get(at(team.id, dm.id, slot.id))).filter((v): v is BoolVar => !!v)
        const u = model.newBoolVar(`occupied_${dm.id}_${slot.id}`)
        model.add(sum(api, vars).equals(u.toLinearExpr()))
        return u
      })
      let start = 0
      while (start < occupied.length) {
        while (start < occupied.length && !occupied[start]) start++
        let end = start
        while (end < occupied.length && occupied[end]) end++
        for (let s = start + 1; s < end - 1; s++) {
          const before = model.newBoolVar(`before_${dm.id}_${s}`)
          const after = model.newBoolVar(`after_${dm.id}_${s}`)
          const left = occupied.slice(start, s).filter((v): v is BoolVar => !!v)
          const right = occupied.slice(s + 1, end).filter((v): v is BoolVar => !!v)
          model.add(sum(api, left).ge(before.toLinearExpr()))
          model.add(sum(api, left).le(before.times(left.length)))
          model.add(sum(api, right).ge(after.toLinearExpr()))
          model.add(sum(api, right).le(after.times(right.length)))
          const gap = model.newBoolVar(`gap_${dm.id}_${s}`)
          model.add(gap.le(before))
          model.add(gap.le(after))
          model.add(gap.plus(occupied[s]!).le(1))
          model.add(gap.ge(before.plus(after).minus(occupied[s]!.toLinearExpr()).minus(1)))
          gaps.push(gap)
        }
        start = end + 1
      }
    }
    dmGaps = sum(api, gaps)
  }

  const metrics = { mutual, dmRequested, teamsServed, teamRequested, total, stable, dmGaps }
  for (const [name, floor] of Object.entries(floors) as [keyof typeof metrics, { direction: Direction; value: number }][]) {
    model.add(floor.direction === 'max' ? metrics[name].ge(floor.value) : metrics[name].le(floor.value))
  }
  return { model, x, metrics }
}

function decode(input: AdvancedSolverInput, state: ModelState, result: CpSolverResult): PlacedMeeting[] {
  const out: PlacedMeeting[] = []
  for (const team of input.teams) for (const dm of input.dms) for (const slot of input.slots) {
    const v = state.x.get(`${team.id}|${dm.id}|${slot.id}`)
    if (v && result.value(v) > 0) out.push({ team: team.id, dm: dm.id, slot: slot.id })
  }
  return out
}

export async function solveWithCpSat(api: Api, input: AdvancedSolverInput): Promise<AdvancedSolverResult> {
  const started = performance.now()
  const solver: CpSolver = await api.CpSolver.create()
  const phases: SolverPhase[] = []
  const floors: Partial<Record<keyof ModelState['metrics'], { direction: Direction; value: number }>> = {}
  const budget = Math.max(700, input.maxTimeMs ?? 3000)
  let incumbent = validateAdvancedBoard(input, input.fallbackHint).length ? [] : input.fallbackHint
  let hasSolverIncumbent = false
  let allOptimal = true

  const run = (state: ModelState, name: SolverPhase['name'], metric: keyof ModelState['metrics'], direction: Direction, seconds: number) => {
    if (direction === 'max') state.model.maximize(state.metrics[metric])
    else state.model.minimize(state.metrics[metric])
    const result = solver.solve(state.model, { maxTimeInSeconds: seconds, numWorkers: 1 })
    const status = solutionStatus(api, result)
    const phase: SolverPhase = { name, status }
    if (status !== 'no incumbent') {
      const board = decode(input, state, result)
      const errors = validateAdvancedBoard(input, board)
      if (errors.length) throw new Error(`CP-SAT returned an invalid board: ${errors.join(', ')}`)
      incumbent = board
      hasSolverIncumbent = true
      const value = Math.round(result.objectiveValue)
      phase.value = value
      phase.bound = Math.round(result.bestObjectiveBound)
      floors[metric] = { direction, value }
      state.model.add(direction === 'max' ? state.metrics[metric].ge(value) : state.metrics[metric].le(value))
    } else allOptimal = false
    if (status !== 'optimal') allOptimal = false
    phases.push(phase)
  }

  const a = buildModel(api, input, false, floors, incumbent)
  // Portable CP-SAT needs enough time to get through first-solve startup even
  // on tiny fixtures; later stages usually prove before their limit.
  const short = Math.max(0.15, budget / 1000 / 9)
  run(a, 'mutual requests', 'mutual', 'max', short)
  run(a, 'DM requests', 'dmRequested', 'max', short)
  run(a, 'teams served', 'teamsServed', 'max', short)
  run(a, 'team requests', 'teamRequested', 'max', short)

  const b = buildModel(api, input, true, floors, incumbent)
  run(b, 'DM gaps', 'dmGaps', 'min', short * 2)
  run(b, 'total meetings', 'total', 'max', short)
  run(b, 'stability', 'stable', 'max', short)

  const runtimeMs = performance.now() - started
  if (!hasSolverIncumbent && !incumbent.length && input.teams.length && input.dms.length && Object.keys(input.dmAsks).length + Object.keys(input.teamAsks).length > 0) {
    return { kind: 'failed', phases, runtimeMs, message: 'No valid CP-SAT incumbent was found before the time limit.', solver: solverInfo() }
  }
  // Recompute metrics independently as a final read of the board; this also
  // makes accidental protocol/model drift visible in tests and diagnostics.
  advancedMetrics(input, incumbent)
  return { kind: allOptimal ? 'optimal' : 'feasible', meetings: incumbent, phases, runtimeMs, solver: solverInfo() }
}

const solverInfo = () => ({ package: 'cpsat-js' as const, version: '1.3.0' as const, variant: 'portable' as const, policy: ADVANCED_POLICY_VERSION })
