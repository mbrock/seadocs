import { describe, expect, test, vi } from 'vitest'
import { formatSolverStatus, startAdvancedSolve, type WorkerLike } from './advancedSolverClient'
import type { AdvancedSolverInput, SolveRequest } from './advancedSolver'

const input: AdvancedSolverInput = { teams: [], dms: [], slots: [], dmAsks: {}, teamAsks: {}, currentBoard: [], fallbackHint: [] }

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent?: SolveRequest
  terminated = false
  postMessage(message: SolveRequest) { this.sent = message }
  terminate() { this.terminated = true }
}

describe('advanced worker client', () => {
  test('logs and forwards status without completing the run', () => {
    const worker = new FakeWorker()
    const result = vi.fn()
    const status = vi.fn()
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    startAdvancedSolve(input, result, vi.fn(), status, () => worker)
    worker.onmessage!({ data: { type: 'status', runId: worker.sent!.runId, status: { state: 'phase-started', elapsedMs: 10, phase: 'DM requests' } } } as MessageEvent)
    expect(log).toHaveBeenCalledWith('[CP-SAT] CP-SAT · ?/7 DM requests · maximizing · no time limit · elapsed 0.01s')
    expect(status).toHaveBeenCalledWith({ state: 'phase-started', elapsedMs: 10, phase: 'DM requests' })
    expect(result).not.toHaveBeenCalled()
    expect(worker.terminated).toBe(false)
    log.mockRestore()
  })

  test('formats useful progress, proof, and incumbent details', () => {
    expect(formatSolverStatus({ state: 'phase-started', mode: 'quick', elapsedMs: 420, phase: 'DM gaps', phaseIndex: 5, totalPhases: 7, direction: 'minimize', timeLimitSeconds: 0.67 })).toBe(
      '[CP-SAT] Quick · 5/7 DM gaps · minimizing · 0.67s limit · elapsed 0.42s',
    )
    expect(formatSolverStatus({ state: 'incumbent', mode: 'thorough', elapsedMs: 1234, phase: 'DM requests', phaseIndex: 2, totalPhases: 7, objectiveValue: 91, bestObjectiveBound: 94, solverWallTime: 0.8 })).toBe(
      '[CP-SAT] Thorough · 2/7 DM requests · new incumbent 91 · best possible bound 94 · stage time 0.80s · elapsed 1.23s',
    )
    expect(formatSolverStatus({ state: 'phase-complete', mode: 'quick', elapsedMs: 900, phase: 'mutual requests', phaseIndex: 1, totalPhases: 7, result: { name: 'mutual requests', status: 'optimal', value: 42, bound: 42 } })).toBe(
      '[CP-SAT] Quick · 1/7 mutual requests · OPTIMAL (proven) · final value 42 · best possible bound 42 · elapsed 0.90s',
    )
  })

  test('sends a versioned run, accepts its response, and terminates', () => {
    const worker = new FakeWorker()
    const result = vi.fn()
    startAdvancedSolve(input, result, vi.fn(), vi.fn(), () => worker)
    worker.onmessage!({ data: { type: 'result', runId: worker.sent!.runId, result: { kind: 'feasible', phases: [], runtimeMs: 1, solver: {} } } } as MessageEvent)
    expect(result).toHaveBeenCalledOnce()
    expect(worker.terminated).toBe(true)
  })

  test('termination cancels and stale responses cannot apply', () => {
    const worker = new FakeWorker()
    const result = vi.fn()
    const cancel = startAdvancedSolve(input, result, vi.fn(), vi.fn(), () => worker)
    cancel()
    worker.onmessage!({ data: { type: 'result', runId: worker.sent!.runId, result: {} } } as MessageEvent)
    expect(result).not.toHaveBeenCalled()
    expect(worker.terminated).toBe(true)
  })

  test('worker errors use the fallback callback', () => {
    const worker = new FakeWorker()
    const failed = vi.fn()
    startAdvancedSolve(input, vi.fn(), failed, vi.fn(), () => worker)
    worker.onerror!({ message: 'WASM failed' } as ErrorEvent)
    expect(failed).toHaveBeenCalledWith('WASM failed')
    expect(worker.terminated).toBe(true)
  })
})
