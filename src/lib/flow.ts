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
//
// Fairness: among selections of equal total weight there are usually many, and
// the plain flow picks one arbitrarily — leaving one decision maker with two
// of six asks met while another gets all nine. So each person's k-th meeting
// carries a secondary "fair share" cost that grows with k relative to how much
// they asked for. Costs are pairs (weight, share) compared lexicographically:
// share can only ever break a tie in weight, never trade away an ask. Both
// parts are integers, so the arithmetic is exact and the search terminates.

import { allPairs, availableCounts, type Meeting, type ScheduleInput } from './scheduler'

export interface FlowOptions {
  /** Value of scheduling this pair; pairs with weight <= 0 are never chosen. */
  weight: (dmScore: number, teamScore: number) => number
  /** Each team's first `teamFloor` meetings are worth more than anything else. */
  teamFloor?: number
  /**
   * Extra value of a pair that only counts after weight AND fair share tie —
   * a way to rank team asks below fairness. Whole numbers, at most a few per pair.
   */
  tieBreak?: (dmScore: number, teamScore: number) => number
}

interface Edge {
  to: number
  cap: number
  /** Primary cost: minus the pair weight (a reward), or a floor reward. */
  cost: number
  /** Secondary cost: fair-share, only compared when primary costs tie. */
  share: number
  rev: number
}

/**
 * Fair-share costs are ratios k/asks, kept as integers at this resolution.
 * Two different ratios differ by at least 1/(asks · asks'), so with asks ≤ 60
 * slots any nonzero share difference is ≥ SHARE_SCALE / 3600 ≈ 278 000 —
 * far more than the tie-break rewards can add up to, which keeps them third.
 */
const SHARE_SCALE = 1_000_000_000

/** The maximum-weight set of meetings where nobody has more meetings than slots. */
export function selectByFlow(input: ScheduleInput, { weight, teamFloor = 0, tieBreak = () => 0 }: FlowOptions): Meeting[] {
  const T = input.teams.length
  const D = input.dms.length
  const cap = availableCounts([...input.teams, ...input.dms], input.slots)
  const SRC = 0
  const SINK = 1
  const teamNode = (t: number) => 2 + t
  const dmNode = (d: number) => 2 + T + d
  const N = 2 + T + D
  const graph: Edge[][] = Array.from({ length: N }, () => [])
  const addEdge = (u: number, v: number, cap: number, cost: number, share = 0) => {
    graph[u].push({ to: v, cap, cost, share, rev: graph[v].length })
    graph[v].push({ to: u, cap: 0, cost: -cost, share: -share, rev: graph[u].length - 1 })
  }

  // Rewards are negative costs. A team's first `floor` meetings carry a reward
  // that outweighs any combination of pair weights, so the solver fills floors
  // first and only then optimises interest.
  let maxWeight = 0
  const pairs = allPairs(input).map((p) => ({ ...p, w: weight(p.dmScore, p.teamScore) }))
  for (const p of pairs) maxWeight = Math.max(maxWeight, p.w)
  const FLOOR_REWARD = maxWeight * pairs.length + 1

  // Fair-share costs. A person with A asks pays k/A for their k-th meeting:
  // someone with 2 of 6 met is at 2/6, someone with 8 of 13 at 8/13, so the
  // next tied meeting goes to the first.
  const asksTeam = new Array<number>(T).fill(0)
  const asksDm = new Array<number>(D).fill(0)
  for (const p of pairs) {
    if (p.teamScore > 0) asksTeam[p.ti]++
    if (p.dmScore > 0) asksDm[p.di]++
  }
  const share = (k: number, asks: number) => Math.round((k / Math.max(asks, 1)) * SHARE_SCALE)

  // One unit edge per possible meeting of each person, so that the k-th meeting
  // can cost more than the (k-1)-th. A team's first `floor` meetings carry a
  // reward that outweighs any combination of pair weights, so the solver fills
  // floors first and only then optimises interest.
  for (let t = 0; t < T; t++) {
    const c = cap.get(input.teams[t].id) ?? 0
    const floor = Math.min(teamFloor, c)
    for (let k = 0; k < c; k++) addEdge(SRC, teamNode(t), 1, k < floor ? -FLOOR_REWARD : 0, share(k, asksTeam[t]))
  }
  for (let d = 0; d < D; d++) {
    const c = cap.get(input.dms[d].id) ?? 0
    for (let k = 0; k < c; k++) addEdge(dmNode(d), SINK, 1, 0, share(k, asksDm[d]))
  }
  for (const p of pairs) if (p.w > 0) addEdge(teamNode(p.ti), dmNode(p.di), 1, -p.w, -tieBreak(p.dmScore, p.teamScore))

  // Augment along the cheapest path while it still pays. Distances are
  // (cost, share) pairs compared lexicographically.
  const dist = new Array<number>(N)
  const distShare = new Array<number>(N)
  const inQueue = new Array<boolean>(N)
  const prevNode = new Array<number>(N)
  const prevEdge = new Array<number>(N)
  const less = (c: number, s: number, v: number) => c < dist[v] || (c === dist[v] && s < distShare[v])
  for (;;) {
    dist.fill(Infinity)
    distShare.fill(Infinity)
    inQueue.fill(false)
    prevNode.fill(-1)
    dist[SRC] = 0
    distShare[SRC] = 0
    const queue = [SRC]
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]
      inQueue[u] = false
      graph[u].forEach((e, i) => {
        if (e.cap <= 0) return
        const c = dist[u] + e.cost
        const s = distShare[u] + e.share
        if (less(c, s, e.to)) {
          dist[e.to] = c
          distShare[e.to] = s
          prevNode[e.to] = u
          prevEdge[e.to] = i
          if (!inQueue[e.to]) {
            inQueue[e.to] = true
            queue.push(e.to)
          }
        }
      })
    }
    if (dist[SINK] > 0 || (dist[SINK] === 0 && distShare[SINK] >= 0)) break
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
