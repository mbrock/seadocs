/// <reference lib="webworker" />

import type { SolveRequest, SolveResponse, SolveStatusResponse, SolverStatusInfo } from '../lib/advancedSolver'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  const request = event.data
  if (request?.type !== 'solve') return
  const started = performance.now()
  const status = (info: SolverStatusInfo) => {
    const response: SolveStatusResponse = { type: 'status', runId: request.runId, status: { mode: request.input.stageTimeMs === undefined ? 'quick' : 'thorough', ...info } }
    self.postMessage(response)
  }
  try {
    // The large WASM dependency is fetched only after this worker receives an
    // explicit advanced-solve request.
    status({ state: 'loading', elapsedMs: 0, totalPhases: 7 })
    const [api, model] = await Promise.all([import('cpsat-js/portable'), import('../lib/cpsatModel')])
    const solveOffsetMs = Math.round(performance.now() - started)
    status({ state: 'initializing', elapsedMs: solveOffsetMs, totalPhases: 7 })
    const result = await model.solveWithCpSat(api, request.input, (info) => status({ ...info, elapsedMs: solveOffsetMs + info.elapsedMs }))
    const response: SolveResponse = { type: 'result', runId: request.runId, result }
    self.postMessage(response)
  } catch (error) {
    status({ state: 'failed', elapsedMs: Math.round(performance.now() - started), totalPhases: 7, message: error instanceof Error ? error.message : String(error) })
    const response: SolveResponse = {
      type: 'result',
      runId: request.runId,
      result: {
        kind: 'failed',
        phases: [],
        runtimeMs: 0,
        message: error instanceof Error ? error.message : String(error),
        solver: { package: 'cpsat-js', version: '1.3.0', variant: 'portable', policy: 'local-cpsat-v1' },
      },
    }
    self.postMessage(response)
  }
}
