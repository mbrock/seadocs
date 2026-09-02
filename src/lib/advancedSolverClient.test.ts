import { describe, expect, test, vi } from 'vitest'
import { startAdvancedSolve, type WorkerLike } from './advancedSolverClient'
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
  test('sends a versioned run, accepts its response, and terminates', () => {
    const worker = new FakeWorker()
    const result = vi.fn()
    startAdvancedSolve(input, result, vi.fn(), () => worker)
    worker.onmessage!({ data: { type: 'result', runId: worker.sent!.runId, result: { kind: 'feasible', phases: [], runtimeMs: 1, solver: {} } } } as MessageEvent)
    expect(result).toHaveBeenCalledOnce()
    expect(worker.terminated).toBe(true)
  })

  test('termination cancels and stale responses cannot apply', () => {
    const worker = new FakeWorker()
    const result = vi.fn()
    const cancel = startAdvancedSolve(input, result, vi.fn(), () => worker)
    cancel()
    worker.onmessage!({ data: { type: 'result', runId: worker.sent!.runId, result: {} } } as MessageEvent)
    expect(result).not.toHaveBeenCalled()
    expect(worker.terminated).toBe(true)
  })

  test('worker errors use the fallback callback', () => {
    const worker = new FakeWorker()
    const failed = vi.fn()
    startAdvancedSolve(input, vi.fn(), failed, () => worker)
    worker.onerror!({ message: 'WASM failed' } as ErrorEvent)
    expect(failed).toHaveBeenCalledWith('WASM failed')
    expect(worker.terminated).toBe(true)
  })
})
