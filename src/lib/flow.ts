// Exact meeting selection by minimum-cost flow.
//
// Choosing which pairs meet, with nobody having more meetings than slots, is a
// bipartite b-matching: teams on the left, decision makers on the right, one
// unit of capacity per possible meeting. Maximising the total weight of chosen
// pairs is a min-cost flow problem, solved exactly here by successive shortest
// paths (Bellman-Ford/SPFA, fine for a few hundred nodes and edges).
//
// The weight function is the knob: different weightings of decision-maker vs
// team interest give different exact optima, and those become seeds of the
// Pareto frontier.

import { allPairs, type Meeting, type ScheduleInput } from './scheduler'

export interface FlowOptions {
  /** Value of scheduling this pair; pairs with weight <= 0 are never chosen. */
  weight: (dmScore: number, teamScore: number) => number
  /** Each team's first `teamFloor` meetings are worth more than anything else. */
  teamFloor?: number
}

interface Edge {
  to: number
  cap: number
  cost: number
  rev: number
}

/** The maximum-weight set of meetings where nobody has more meetings than slots. */
export function selectByFlow(input: ScheduleInput, { weight, teamFloor = 0 }: FlowOptions): Meeting[] {
  const T = input.teams.length
  const D = input.dms.length
  const S = input.slots.length
  const SRC = 0
  const SINK = 1
  const teamNode = (t: number) => 2 + t
  const dmNode = (d: number) => 2 + T + d
  const N = 2 + T + D
  const graph: Edge[][] = Array.from({ length: N }, () => [])
  const addEdge = (u: number, v: number, cap: number, cost: number) => {
    graph[u].push({ to: v, cap, cost, rev: graph[v].length })
    graph[v].push({ to: u, cap: 0, cost: -cost, rev: graph[u].length - 1 })
  }

  // Rewards are negative costs. A team's first `floor` meetings carry a reward
  // that outweighs any combination of pair weights, so the solver fills floors
  // first and only then optimises interest.
  let maxWeight = 0
  const pairs = allPairs(input).map((p) => ({ ...p, w: weight(p.dmScore, p.teamScore) }))
  for (const p of pairs) maxWeight = Math.max(maxWeight, p.w)
  const FLOOR_REWARD = maxWeight * pairs.length + 1
  const floor = Math.min(teamFloor, S)
  for (let t = 0; t < T; t++) {
    if (floor > 0) addEdge(SRC, teamNode(t), floor, -FLOOR_REWARD)
    if (S - floor > 0) addEdge(SRC, teamNode(t), S - floor, 0)
  }
  for (let d = 0; d < D; d++) addEdge(dmNode(d), SINK, S, 0)
  for (const p of pairs) if (p.w > 0) addEdge(teamNode(p.ti), dmNode(p.di), 1, -p.w)

  // Augment along the cheapest path while it still pays.
  const dist = new Array<number>(N)
  const inQueue = new Array<boolean>(N)
  const prevNode = new Array<number>(N)
  const prevEdge = new Array<number>(N)
  for (;;) {
    dist.fill(Infinity)
    inQueue.fill(false)
    prevNode.fill(-1)
    dist[SRC] = 0
    const queue = [SRC]
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]
      inQueue[u] = false
      graph[u].forEach((e, i) => {
        if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
          dist[e.to] = dist[u] + e.cost
          prevNode[e.to] = u
          prevEdge[e.to] = i
          if (!inQueue[e.to]) {
            inQueue[e.to] = true
            queue.push(e.to)
          }
        }
      })
    }
    if (dist[SINK] >= 0) break
    for (let v = SINK; v !== SRC; v = prevNode[v]) {
      const e = graph[prevNode[v]][prevEdge[v]]
      e.cap -= 1
      graph[v][e.rev].cap += 1
    }
  }

  const chosen: Meeting[] = []
  for (let t = 0; t < T; t++) {
    for (const e of graph[teamNode(t)]) {
      const d = e.to - dmNode(0)
      if (d >= 0 && d < D && e.cost < 0 && e.cap === 0) chosen.push({ team: input.teams[t].id, dm: input.dms[d].id })
    }
  }
  return chosen
}
