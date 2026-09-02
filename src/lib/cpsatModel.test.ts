import { describe, expect, test } from 'vitest'
import * as api from 'cpsat-js/portable'
import { solveWithCpSat } from './cpsatModel'
import { advancedMetrics, validateAdvancedBoard, type AdvancedSolverInput } from './advancedSolver'
import { numberedSlots } from './fixtures'
import { sampleProject } from './sample'
import { optimize } from './optimize'

const participant = (id: string, unavailable?: string[]) => ({ id, name: id, ...(unavailable ? { unavailable } : {}) })
const solve = (input: Omit<AdvancedSolverInput, 'currentBoard' | 'fallbackHint'>) => solveWithCpSat(api, { ...input, currentBoard: [], fallbackHint: [], maxTimeMs: 700 })

describe('integrated CP-SAT model', () => {
  test('protects a mutual request at a one-slot bottleneck', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1')], slots: numberedSlots(1),
      dmAsks: { 't1|d1': true, 't2|d1': true } as const, teamAsks: { 't1|d1': true } as const,
    }
    const result = await solve(input)
    expect(result.meetings).toEqual([{ team: 't1', dm: 'd1', slot: 's1' }])
    expect(result.phases[0]).toMatchObject({ name: 'mutual requests', value: 1 })
  })

  test('joint availability is hard feasibility, not post-placement cleanup', async () => {
    const input = {
      teams: [participant('t1', ['s2'])], dms: [participant('d1', ['s1'])], slots: numberedSlots(2),
      dmAsks: { 't1|d1': true } as const, teamAsks: { 't1|d1': true } as const,
    }
    const result = await solve(input)
    expect(result.meetings).toEqual([])
    expect(result.kind).toBe('optimal')
  })

  test('keeps a useful team-requested extra within the DM burden guardrail', async () => {
    const input = {
      teams: [participant('t1'), participant('t2'), participant('t3')], dms: [participant('d1')], slots: numberedSlots(3),
      dmAsks: { 't1|d1': true } as const, teamAsks: { 't2|d1': true, 't3|d1': true } as const,
    }
    const result = await solve(input)
    expect(validateAdvancedBoard(input, result.meetings ?? [])).toEqual([])
    const metrics = advancedMetrics({ ...input, currentBoard: [], fallbackHint: [] }, result.meetings ?? [])
    expect(metrics.dmRequested).toBe(1)
    expect(metrics.teamRequested).toBe(1)
    expect(metrics.total).toBe(2)
  })

  test('status is only optimal when every stage was proven', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1'), participant('d2')], slots: numberedSlots(2),
      dmAsks: { 't1|d1': true, 't2|d2': true } as const, teamAsks: { 't1|d2': true, 't2|d1': true } as const,
    }
    const result = await solve(input)
    expect(result.kind === 'optimal').toBe(result.phases.every((p) => p.status === 'optimal'))
  })

  test('prove-optimal mode runs every stage without a cutoff', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1')], slots: numberedSlots(1),
      dmAsks: { 't1|d1': true, 't2|d1': true } as const, teamAsks: { 't1|d1': true } as const,
    }
    const statuses: import('./advancedSolver').SolverStatusInfo[] = []
    const result = await solveWithCpSat(api, { ...input, currentBoard: [], fallbackHint: [], proveOptimal: true }, (status) => statuses.push(status))
    expect(result.kind).toBe('optimal')
    expect(result.phases.every((phase) => phase.status === 'optimal')).toBe(true)
    expect(result.meetings).toEqual([{ team: 't1', dm: 'd1', slot: 's1' }])
    expect(statuses.filter((status) => status.state === 'phase-started').map((status) => status.phase)).toEqual(result.phases.map((phase) => phase.name))
    expect(statuses.at(-1)).toMatchObject({ state: 'complete', resultKind: 'optimal', totalPhases: 7 })
  })

  test('solves the deterministic 13×17 sample at normal event scale', async () => {
    const project = sampleProject()
    const fallbackHint = optimize(project)[0].meetings
    const result = await solveWithCpSat(api, { ...project, currentBoard: [], fallbackHint, maxTimeMs: 3000 })
    console.log(`CP-SAT 13×17×9: ${result.kind}, ${result.meetings?.length ?? 0} meetings, ${result.runtimeMs.toFixed(0)}ms`)
    expect(result.kind === 'optimal' || result.kind === 'feasible').toBe(true)
    expect(validateAdvancedBoard(project, result.meetings ?? [])).toEqual([])
    expect(result.runtimeMs).toBeLessThan(10_000)
  }, 15_000)
})
