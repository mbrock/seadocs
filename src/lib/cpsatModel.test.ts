import { describe, expect, test } from 'vitest'
import * as api from 'cpsat-js/portable'
import { solveWithCpSat } from './cpsatModel'
import { advancedMetrics, validateAdvancedBoard, type AdvancedSolverInput } from './advancedSolver'
import { numberedSlots } from './fixtures'
import { sampleProject } from './sample'
import { optimize } from './optimize'

const participant = (id: string, unavailable?: string[]) => ({ id, name: id, ...(unavailable ? { unavailable } : {}) })
const solve = (input: Omit<AdvancedSolverInput, 'currentBoard' | 'fallbackHint'>) => solveWithCpSat(api, { ...input, currentBoard: [], fallbackHint: [] })

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

  test('fills the room the requests leave: a DM meets every team that has a free slot', async () => {
    const input = {
      teams: [participant('t1'), participant('t2'), participant('t3')], dms: [participant('d1')], slots: numberedSlots(3),
      dmAsks: { 't1|d1': true } as const, teamAsks: { 't2|d1': true } as const,
    }
    const result = await solve(input)
    expect(validateAdvancedBoard(input, result.meetings ?? [])).toEqual([])
    const metrics = advancedMetrics({ ...input, currentBoard: [], fallbackHint: [] }, result.meetings ?? [])
    expect(metrics.dmRequested).toBe(1)
    expect(metrics.teamRequested).toBe(1)
    expect(metrics.total).toBe(3) // t3 is nobody's request but there is a seat, so they meet
  })

  test('requests come first when seats are scarce; fillers only take what is left', async () => {
    const input = {
      teams: [participant('t1'), participant('t2'), participant('t3')], dms: [participant('d1'), participant('d2')], slots: numberedSlots(2),
      dmAsks: { 't1|d1': true, 't2|d2': true } as const, teamAsks: { 't3|d1': true } as const,
    }
    const result = await solve(input)
    const met = new Set((result.meetings ?? []).map((m) => `${m.team}|${m.dm}`))
    expect(met.has('t1|d1')).toBe(true)
    expect(met.has('t2|d2')).toBe(true)
    expect(met.has('t3|d1')).toBe(true)
    expect(result.meetings).toHaveLength(4) // both DMs sit in both slots
  })

  test('status is only optimal when every stage was proven', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1'), participant('d2')], slots: numberedSlots(2),
      dmAsks: { 't1|d1': true, 't2|d2': true } as const, teamAsks: { 't1|d2': true, 't2|d1': true } as const,
    }
    const result = await solve(input)
    expect(result.kind === 'optimal').toBe(result.phases.every((p) => p.status === 'optimal'))
  })

  test('gives every stage the same one-second limit', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1')], slots: numberedSlots(1),
      dmAsks: { 't1|d1': true, 't2|d1': true } as const, teamAsks: { 't1|d1': true } as const,
    }
    const statuses: import('./advancedSolver').SolverStatusInfo[] = []
    const result = await solveWithCpSat(api, { ...input, currentBoard: [], fallbackHint: [] }, (status) => statuses.push(status))
    expect(result.kind).toBe('optimal')
    expect(result.phases.every((phase) => phase.status === 'optimal')).toBe(true)
    expect(result.phases.map((phase) => phase.name)).toEqual([
      'mutual requests',
      'DM requests',
      'teams served',
      'team requests',
      'total meetings',
      'DM request fairness',
      'DM meeting fairness',
      'DM gaps',
      'stability',
    ])
    expect(result.meetings).toEqual([{ team: 't1', dm: 'd1', slot: 's1' }])
    const starts = statuses.filter((status) => status.state === 'phase-started')
    expect(starts.map((status) => status.phase)).toEqual(result.phases.map((phase) => phase.name))
    expect(starts.every((status) => status.timeLimitSeconds === 1)).toBe(true)
    expect(statuses.at(-1)).toMatchObject({ state: 'complete', resultKind: 'optimal', totalPhases: 9 })
  })

  test.each([false, true])('spreads scarce requested meetings regardless of roster direction (reversed=%s)', async (reversed) => {
    const dms = [participant('d1'), participant('d2'), participant('d3'), participant('d4')]
    const input = {
      teams: [participant('t1'), participant('t2')], dms: reversed ? dms.toReversed() : dms, slots: numberedSlots(2),
      dmAsks: Object.fromEntries(dms.flatMap((d) => ['t1', 't2'].map((t) => [`${t}|${d.id}`, true as const]))), teamAsks: {},
      currentBoard: [
        { team: 't1', dm: 'd1', slot: 's1' }, { team: 't2', dm: 'd1', slot: 's2' },
        { team: 't2', dm: 'd2', slot: 's1' }, { team: 't1', dm: 'd2', slot: 's2' },
      ], fallbackHint: [],
    }
    const result = await solveWithCpSat(api, input)
    expect(validateAdvancedBoard(input, result.meetings ?? [])).toEqual([])
    expect(result.meetings).toHaveLength(4)
    expect(dms.map((d) => result.meetings!.filter((m) => m.dm === d.id).length)).toEqual([1, 1, 1, 1])
    expect(result.phases.find((p) => p.name === 'DM request fairness')).toMatchObject({ status: 'optimal', value: 4 })
  })

  test('balances introductions even for DMs without requests, respecting availability', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')],
      dms: [participant('d1'), participant('d2'), participant('d3'), participant('away', ['s1', 's2', 's3'])],
      slots: numberedSlots(3), dmAsks: {}, teamAsks: {},
    }
    const result = await solve(input)
    expect(validateAdvancedBoard(input, result.meetings ?? [])).toEqual([])
    expect(input.dms.map((d) => result.meetings!.filter((m) => m.dm === d.id).length)).toEqual([2, 2, 2, 0])
  })

  test('fairness never sacrifices mutual requests to equalize counts', async () => {
    const input = {
      teams: [participant('t1'), participant('t2')], dms: [participant('d1'), participant('d2'), participant('d3')],
      slots: numberedSlots(2), dmAsks: { 't1|d1': true, 't2|d1': true } as const,
      teamAsks: { 't1|d1': true, 't2|d1': true } as const,
    }
    const result = await solve(input)
    expect(advancedMetrics({ ...input, currentBoard: [], fallbackHint: [] }, result.meetings!)).toMatchObject({ mutual: 2, dmRequested: 2, total: 4 })
    expect(input.dms.map((d) => result.meetings!.filter((m) => m.dm === d.id).length)).toEqual([2, 1, 1])
  })

  test('solves the deterministic 13×17 sample at normal event scale', async () => {
    const project = sampleProject()
    const fallbackHint = optimize(project)[0].meetings
    const result = await solveWithCpSat(api, { ...project, currentBoard: [], fallbackHint })
    console.log(`CP-SAT 13×17×9: ${result.kind}, ${result.meetings?.length ?? 0} meetings, ${result.runtimeMs.toFixed(0)}ms`)
    expect(result.kind === 'optimal' || result.kind === 'feasible').toBe(true)
    expect(validateAdvancedBoard(project, result.meetings ?? [])).toEqual([])
    expect(result.runtimeMs).toBeLessThan(12_000)
  }, 15_000)
})
