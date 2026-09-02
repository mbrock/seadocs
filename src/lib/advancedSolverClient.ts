import { isSolveResponse, isSolveStatusResponse, type AdvancedSolverInput, type AdvancedSolverResult, type SolveRequest } from './advancedSolver'

export interface WorkerLike {
  postMessage(message: SolveRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export type WorkerFactory = () => WorkerLike

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('../workers/cpsat.worker.ts', import.meta.url), { type: 'module' })

let nextRunId = 1

/** One worker per solve makes termination a reliable hard cancellation boundary. */
export function startAdvancedSolve(
  input: AdvancedSolverInput,
  onResult: (result: AdvancedSolverResult) => void,
  onError: (message: string) => void,
  createWorker: WorkerFactory = defaultWorkerFactory,
): () => void {
  const worker = createWorker()
  const runId = nextRunId++
  let active = true
  const finish = () => {
    active = false
    worker.terminate()
  }
  worker.onmessage = (event) => {
    if (!active) return
    if (isSolveStatusResponse(event.data) && event.data.runId === runId) {
      console.info('[CP-SAT status]', event.data.status)
      return
    }
    if (!isSolveResponse(event.data) || event.data.runId !== runId) return
    finish()
    onResult(event.data.result)
  }
  worker.onerror = (event) => {
    if (!active) return
    finish()
    onError(event.message || 'The local solver worker failed')
  }
  worker.postMessage({ type: 'solve', runId, input })
  return () => {
    if (active) finish()
  }
}
