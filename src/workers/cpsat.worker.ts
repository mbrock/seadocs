/// <reference lib="webworker" />

import type { SolveRequest, SolveResponse } from '../lib/advancedSolver'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  const request = event.data
  if (request?.type !== 'solve') return
  try {
    // The large WASM dependency is fetched only after this worker receives an
    // explicit advanced-solve request.
    const [api, model] = await Promise.all([import('cpsat-js/portable'), import('../lib/cpsatModel')])
    const result = await model.solveWithCpSat(api, request.input)
    const response: SolveResponse = { type: 'result', runId: request.runId, result }
    self.postMessage(response)
  } catch (error) {
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
