// Squeeze idle windows out of people's days without breaking the schedule.
//
// Swapping two slots a and b for one person is only safe if everybody along
// the chain of meetings that alternate a, b, a, b… swaps too (a Kempe chain).
// In a bipartite graph such a chain never bites its own tail, so applying the
// swap along the whole chain always yields a valid schedule with exactly the
// same meetings. We try chain swaps that would pull an outlying meeting into
// a gap, keep the ones that reduce total windows, and stop at a local optimum.

import { slotIndex, type Id, type Meeting, type PlacedMeeting, type Slot } from './scheduler'

type Node = string
const teamNode = (m: Meeting): Node => 't:' + m.team
const dmNode = (m: Meeting): Node => 'd:' + m.dm

class Grid {
  readonly meetings: Meeting[]
  slot: number[]
  private at = new Map<Node, Map<number, number>>()

  constructor(meetings: Meeting[], slots: number[]) {
    this.meetings = meetings
    this.slot = [...slots]
    this.meetings.forEach((m, i) => {
      this.cell(teamNode(m)).set(this.slot[i], i)
      this.cell(dmNode(m)).set(this.slot[i], i)
    })
  }

  cell(node: Node): Map<number, number> {
    let c = this.at.get(node)
    if (!c) this.at.set(node, (c = new Map()))
    return c
  }

  /** Swap slots a and b along the alternating chain starting at `node`. Returns the touched meetings. */
  swapChain(node: Node, a: number, b: number): number[] {
    const chain: number[] = []
    let n = node
    let s = a
    for (;;) {
      const i = this.cell(n).get(s)
      if (i === undefined || chain.includes(i)) break
      chain.push(i)
      const m = this.meetings[i]
      n = n === teamNode(m) ? dmNode(m) : teamNode(m)
      s = s === a ? b : a
    }
    for (const i of chain) {
      const m = this.meetings[i]
      this.cell(teamNode(m)).delete(this.slot[i])
      this.cell(dmNode(m)).delete(this.slot[i])
    }
    for (const i of chain) {
      const m = this.meetings[i]
      this.slot[i] = this.slot[i] === a ? b : a
      this.cell(teamNode(m)).set(this.slot[i], i)
      this.cell(dmNode(m)).set(this.slot[i], i)
    }
    return chain
  }

  /** Idle slots strictly inside this node's day. */
  windows(node: Node): number {
    const used = [...this.cell(node).keys()]
    if (used.length < 2) return 0
    return Math.max(...used) - Math.min(...used) + 1 - used.length
  }

  nodes(prefix: 't:' | 'd:'): Node[] {
    return [...this.at.keys()].filter((n) => n.startsWith(prefix))
  }

  score(): [number, number] {
    let dm = 0
    let team = 0
    for (const n of this.at.keys()) {
      if (n.startsWith('d:')) dm += this.windows(n)
      else team += this.windows(n)
    }
    return [dm, team]
  }
}

const better = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

function gridOf(placed: PlacedMeeting[], slots: Slot[]): Grid {
  const index = slotIndex(slots)
  return new Grid(
    placed.map(({ team, dm }) => ({ team, dm })),
    placed.map((m) => index.get(m.slot)!),
  )
}

/**
 * Reduce decision-maker windows first, then team windows, by Kempe-chain slot
 * swaps. Never changes which meetings happen. Deterministic.
 */
export function compactSlots(placed: PlacedMeeting[], slots: Slot[]): PlacedMeeting[] {
  if (!placed.length) return placed
  const grid = gridOf(placed, slots)
  let best = grid.score()
  let improved = true
  while (improved) {
    improved = false
    for (const node of [...grid.nodes('d:'), ...grid.nodes('t:')]) {
      if (grid.windows(node) === 0) continue
      const used = [...grid.cell(node).keys()].sort((x, y) => x - y)
      const lo = used[0]
      const hi = used[used.length - 1]
      const gaps: number[] = []
      for (let s = lo; s <= hi; s++) if (!grid.cell(node).has(s)) gaps.push(s)
      // Try pulling each meeting into each gap; keep the first swap that helps.
      for (const gap of gaps) {
        let done = false
        for (const from of used) {
          grid.swapChain(node, from, gap)
          const score = grid.score()
          if (better(score, best)) {
            best = score
            improved = true
            done = true
            break
          }
          // Undo: the same chain, walked from the gap end, swaps everything back.
          grid.swapChain(node, gap, from)
        }
        if (done) break
      }
    }
  }
  return placed.map((m, i) => ({ ...m, slot: slots[grid.slot[i]].id }))
}

/** Convenience for tests: participant ids with a gap in their day. */
export function participantsWithWindows(placed: PlacedMeeting[], slots: Slot[], side: 'team' | 'dm'): Id[] {
  const grid = gridOf(placed, slots)
  return grid
    .nodes(side === 'team' ? 't:' : 'd:')
    .filter((n) => grid.windows(n) > 0)
    .map((n) => n.slice(2))
}
