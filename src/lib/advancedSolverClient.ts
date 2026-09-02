import { isSolveResponse, isSolveStatusResponse, type AdvancedSolverInput, type AdvancedSolverResult, type SolverStatusInfo, type SolveRequest } from './advancedSolver'

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

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)}s`
const phaseName = (status: SolverStatusInfo) => status.phase ? `${status.phaseIndex ?? '?'}/${status.totalPhases ?? 7} ${status.phase}` : 'solver'
const valueAndBound = (value?: number, bound?: number, valueLabel = 'value') =>
  [value === undefined ? '' : `${valueLabel} ${value}`, bound === undefined ? '' : `best possible bound ${bound}`].filter(Boolean).join(' · ')

/** Human-readable console output; the Worker protocol remains structured for a future UI. */
export function formatSolverStatus(status: SolverStatusInfo): string {
  const prefix = '[CP-SAT]'
  const elapsed = `elapsed ${seconds(status.elapsedMs)}`
  switch (status.state) {
    case 'loading':
      return `${prefix} loading solver code and WebAssembly`
    case 'initializing':
      return `${prefix} solver downloaded; initializing WebAssembly · ${elapsed}`
    case 'building':
      return `${prefix} building ${status.phaseIndex === 0 ? 'Phase A preference model' : 'Phase B gap/stability model'} · ${elapsed}`
    case 'phase-started': {
      const action = status.direction === 'minimize' ? 'minimizing' : 'maximizing'
      const limit = status.timeLimitSeconds === undefined ? 'no time limit' : `${status.timeLimitSeconds.toFixed(2)}s limit`
      return `${prefix} ${phaseName(status)} · ${action} · ${limit} · ${elapsed}`
    }
    case 'incumbent': {
      const score = valueAndBound(status.objectiveValue, status.bestObjectiveBound, 'new incumbent')
      const solverTime = status.solverWallTime === undefined ? '' : ` · stage time ${seconds(status.solverWallTime * 1000)}`
      return `${prefix} ${phaseName(status)}${score ? ` · ${score}` : ' · new incumbent'}${solverTime} · ${elapsed}`
    }
    case 'phase-complete': {
      const result = status.result
      const proof = result?.status === 'optimal' ? 'OPTIMAL (proven)' : result?.status === 'feasible' ? 'FEASIBLE (time limit)' : 'NO INCUMBENT'
      const score = valueAndBound(result?.value, result?.bound, 'final value')
      return `${prefix} ${phaseName(status)} · ${proof}${score ? ` · ${score}` : ''} · ${elapsed}`
    }
    case 'complete':
      return `${prefix} complete · ${(status.resultKind ?? 'failed').toUpperCase()} · ${elapsed}${status.message ? ` · ${status.message}` : ''}`
    case 'failed':
      return `${prefix} FAILED · ${status.message ?? 'unknown solver error'} · ${elapsed}`
  }
}

/** One worker per solve makes termination a reliable hard cancellation boundary. */
export function startAdvancedSolve(
  input: AdvancedSolverInput,
  onResult: (result: AdvancedSolverResult) => void,
  onError: (message: string) => void,
  onStatus: (status: SolverStatusInfo) => void = () => {},
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
      console.info(formatSolverStatus(event.data.status))
      onStatus(event.data.status)
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
