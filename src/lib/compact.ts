// Squeeze idle windows out of people's days without breaking the schedule.
//
// Swapping two slots a and b for one person is only safe if everybody along
// the chain of meetings that alternate a, b, a, b… swaps too (a Kempe chain).
// In a bipartite graph such a chain never bites its own tail, so applying the
// swap along the whole chain always yields a valid schedule with exactly the
// same meetings. We try chain swaps that would pull an outlying meeting into
// a gap, keep the ones that reduce total windows, and stop at a local optimum.
// A swap that would move anyone into a slot they cannot do is skipped.
//
// A "window" is an idle slot inside someone's day that they COULD have used:
// slots they are unavailable for do not count.

import { alwaysAvailable, slotIndex, type Availability, type Id, type Meeting, type PlacedMeeting, type Slot } from './scheduler'

type Node = string
const teamNode = (m: Meeting): Node => 't:' + m.team
const dmNode = (m: Meeting): Node => 'd:' + m.dm

class Grid {
  readonly meetings: Meeting[]
  slot: number[]
  private at = new Map<Node, Map<number, number>>()
  private can: (node: Node, slot: number) => boolean

  constructor(meetings: Meeting[], slots: number[], can: (node: Node, slot: number) => boolean) {
    this.meetings = meetings
    this.slot = [...slots]
    this.can = can
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

  /**
   * Swap slots a and b along the alternating chain starting at `node`, unless
   * that would put someone into a slot they cannot do. Returns whether it did.
   */
  swapChain(node: Node, a: number, b: number): boolean {
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
      const to = this.slot[i] === a ? b : a
      if (!this.can(teamNode(m), to) || !this.can(dmNode(m), to)) return false
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
    return true
  }

  /** Idle slots strictly inside this node's day that they could have used. */
  windows(node: Node): number {
    return this.gaps(node).length
  }

  /** Slots inside this node's day that are free but could be used. */
  gaps(node: Node): number[] {
    const cells = this.cell(node)
    const used = [...cells.keys()]
    if (used.length < 2) return []
    const lo = Math.min(...used)
    const hi = Math.max(...used)
    const out: number[] = []
    for (let s = lo + 1; s < hi; s++) if (!cells.has(s) && this.can(node, s)) out.push(s)
    return out
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

function gridOf(placed: PlacedMeeting[], slots: Slot[], available: Availability): Grid {
  const index = slotIndex(slots)
  return new Grid(
    placed.map(({ team, dm }) => ({ team, dm })),
    placed.map((m) => index.get(m.slot)!),
    (node, s) => available(node.slice(2), slots[s].id),
  )
}

/**
 * Reduce decision-maker windows first, then team windows, by Kempe-chain slot
 * swaps. Never changes which meetings happen. Deterministic.
 */
export function compactSlots(placed: PlacedMeeting[], slots: Slot[], available: Availability = alwaysAvailable): PlacedMeeting[] {
  if (!placed.length) return placed
  const grid = gridOf(placed, slots, available)
  let best = grid.score()
  let improved = true
  while (improved) {
    improved = false
    for (const node of [...grid.nodes('d:'), ...grid.nodes('t:')]) {
      const gaps = grid.gaps(node)
      if (!gaps.length) continue
      const used = [...grid.cell(node).keys()].sort((x, y) => x - y)
      // Try pulling each meeting into each gap; keep the first swap that helps.
      for (const gap of gaps) {
        let done = false
        for (const from of used) {
          if (!grid.swapChain(node, from, gap)) continue
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
export function participantsWithWindows(placed: PlacedMeeting[], slots: Slot[], side: 'team' | 'dm', available: Availability = alwaysAvailable): Id[] {
  const grid = gridOf(placed, slots, available)
  return grid
    .nodes(side === 'team' ? 't:' : 'd:')
    .filter((n) => grid.windows(n) > 0)
    .map((n) => n.slice(2))
}
