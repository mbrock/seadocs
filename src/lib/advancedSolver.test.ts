import { describe, expect, test } from 'vitest'
import { advancedMetrics, isSolveResponse, validateAdvancedBoard, type AdvancedSolverInput } from './advancedSolver'
import { numberedSlots } from './fixtures'

const input: AdvancedSolverInput = {
  teams: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2', unavailable: ['s2'] }],
  dms: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }],
  slots: numberedSlots(2),
  dmAsks: { 't1|d1': true },
  teamAsks: { 't1|d1': true, 't2|d2': true },
  currentBoard: [{ team: 't1', dm: 'd1', slot: 's1' }],
  fallbackHint: [],
}

describe('advanced solver boundary', () => {
  test('accepts a feasible board and measures policy terms independently', () => {
    const board = [
      { team: 't1', dm: 'd1', slot: 's1' },
      { team: 't2', dm: 'd2', slot: 's1' },
    ]
    expect(validateAdvancedBoard(input, board)).toEqual([])
    expect(advancedMetrics(input, board)).toEqual({ mutual: 1, dmRequested: 1, teamsServed: 2, teamRequested: 2, total: 2, stable: 1 })
  })

  test.each([
    [[{ team: 'missing', dm: 'd1', slot: 's1' }], 'Unknown team'],
    [[{ team: 't1', dm: 'd1', slot: 'missing' }], 'Unknown slot'],
    [[{ team: 't2', dm: 'd1', slot: 's2' }], 'unavailable'],
    [[{ team: 't1', dm: 'd1', slot: 's1' }, { team: 't1', dm: 'd2', slot: 's1' }], 'team-clash'],
    [[{ team: 't1', dm: 'd1', slot: 's1' }, { team: 't1', dm: 'd1', slot: 's2' }], 'duplicate'],
  ])('rejects invalid output: %s', (board, message) => {
    expect(validateAdvancedBoard(input, board).join(' ')).toContain(message)
  })

  test('strictly recognizes worker responses', () => {
    expect(isSolveResponse({ type: 'result', runId: 4, result: {} })).toBe(true)
    expect(isSolveResponse({ type: 'result', runId: '4', result: {} })).toBe(false)
  })
})
