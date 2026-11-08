export const ROUTING_CONCURRENCY = 2
export const ROUTING_QUEUE_LIMIT = 4
export const ROUTING_QUEUE_WAIT_MS = 10_000

export class RoutingBusyError extends Error {
  constructor() {
    super('Lkw-Routing ist ausgelastet. Bitte gleich erneut versuchen.')
  }
}

interface Waiter {
  start: () => void
}

interface RoutingQueueState {
  active: number
  waiting: Waiter[]
}

declare global {
  var _routingQueueState: RoutingQueueState | undefined
}

const state = globalThis._routingQueueState ??= { active: 0, waiting: [] }

function acquire(signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) return Promise.reject(signal.reason)
  if (state.active >= ROUTING_CONCURRENCY && state.waiting.length >= ROUTING_QUEUE_LIMIT) {
    return Promise.reject(new RoutingBusyError())
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      const index = state.waiting.indexOf(waiter)
      if (index >= 0) state.waiting.splice(index, 1)
    }
    const abort = () => { cleanup(); reject(signal.reason) }
    const waiter: Waiter = {
      start: () => {
        cleanup()
        state.active++
        let released = false
        resolve(() => {
          if (released) return
          released = true
          state.active--
          state.waiting[0]?.start()
        })
      },
    }
    if (state.active < ROUTING_CONCURRENCY) {
      waiter.start()
      return
    }
    state.waiting.push(waiter)
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => { cleanup(); reject(new RoutingBusyError()) }, ROUTING_QUEUE_WAIT_MS)
  })
}

export async function runRoutingTask<Result>(signal: AbortSignal, task: () => Promise<Result>): Promise<Result> {
  const release = await acquire(signal)
  if (signal.aborted) {
    release()
    throw signal.reason
  }
  const work = Promise.resolve().then(() => { signal.throwIfAborted(); return task() }).finally(release)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) abort()
  })
}