// Build the Pareto frontier of schedules.
//
// 1. Several exact selections (min-cost flow) under different weightings of
//    decision-maker vs team interest, with and without a per-team floor, with
//    and without filling spare capacity — plus the simple greedy for good
//    measure. Each is an optimum for SOME reasonable notion of "best".
// 2. Every selection is fitted into slots and compacted to remove windows.
// 3. Measured on all objectives; only non-dominated schedules survive.
//
// The result is a short list of genuinely different boards. The first one
// (best in priority order) is a sensible default; the others show what the
// organiser could gain by giving something up.

import { compactSlots } from './compact'
import { selectByFlow } from './flow'
import { addToFrontier, compareLex, measure, type ObjectiveInput, type Objectives } from './objectives'
import { allPairs, assignSlots, MAX_SCORE, selectMeetings, type Meeting, type PlacedMeeting, type Slot } from './scheduler'

export interface Alternative {
  meetings: PlacedMeeting[]
  objectives: Objectives
  /** How this board was found; for debugging and tests, not shown to users. */
  recipe: string
}

/**
 * Relative worth of one point of decision-maker vs team interest. 'dm-first'
 * is lexicographic in points: its DM weight exceeds the sum of ALL team
 * scores, so no amount of team interest can buy back a single DM point.
 * 'tiered' goes further and is lexicographic in tiers: one must-meet outweighs
 * every priority, one priority every "interested", and those every team ask —
 * exactly the objective order — so the board it finds provably minimises
 * missed must-meets, then missed priorities, then missed "interested".
 */
const WEIGHTINGS: [string, number | 'lexicographic' | 'tiered', number][] = [
  ['tiered', 'tiered', 1],
  ['dm-first', 'lexicographic', 1],
  ['dm-leaning', 3, 1],
  ['balanced', 1, 1],
  ['team-leaning', 1, 3],
]

function selectionKey(meetings: Meeting[]): string {
  return meetings
    .map((m) => `${m.team}|${m.dm}`)
    .sort()
    .join(',')
}

/** Every candidate selection worth trying, deduplicated. */
export function candidateSelections(input: ObjectiveInput): { recipe: string; meetings: Meeting[] }[] {
  const out: { recipe: string; meetings: Meeting[] }[] = []
  const seen = new Set<string>()
  const add = (recipe: string, meetings: Meeting[]) => {
    const k = selectionKey(meetings)
    if (seen.has(k)) return
    seen.add(k)
    out.push({ recipe, meetings })
  }

  add('greedy', selectMeetings(input))
  add('greedy+fill', selectMeetings({ ...input, fillGaps: true }))
  const floors = [...new Set([0, input.teamFloor])]
  const pairs = allPairs(input)
  const totalTeamScore = pairs.reduce((sum, p) => sum + p.teamScore, 0)
  // Tier weights: each tier is worth more than every pair of the tier below put together.
  const tier: number[] = [0, totalTeamScore + 1]
  for (let s = 2; s <= MAX_SCORE; s++) tier[s] = tier[s - 1] * (pairs.length + 1)
  for (const [name, dmWeight, wTeam] of WEIGHTINGS) {
    for (const floor of floors) {
      for (const fill of [false, true]) {
        // Requested pairs are worth at least 1000; a filler is worth 1, so
        // fillers only ever use capacity nothing requested could use.
        const points = (dm: number, team: number) =>
          dmWeight === 'tiered' ? tier[dm] + wTeam * team : (dmWeight === 'lexicographic' ? totalTeamScore + 1 : dmWeight) * dm + wTeam * team
        const weight = (dm: number, team: number) => 1000 * points(dm, team) + (fill ? 1 : 0)
        add(`${name}${floor ? ` floor${floor}` : ''}${fill ? ' fill' : ''}`, selectByFlow(input, { weight, teamFloor: floor }))
      }
    }
  }
  return out
}

/** Fit a selection into slots with as few windows as possible. */
export function placeCompactly(meetings: Meeting[], slots: Slot[]): PlacedMeeting[] {
  return compactSlots(assignSlots(meetings, slots), slots)
}

/** The frontier, best-first in objective priority order. */
export function optimize(input: ObjectiveInput): Alternative[] {
  let frontier: Alternative[] = []
  for (const { recipe, meetings } of candidateSelections(input)) {
    const placed = placeCompactly(meetings, input.slots)
    frontier = addToFrontier(frontier, { meetings: placed, objectives: measure(input, placed), recipe }, (a) => a.objectives)
  }
  return frontier.sort((a, b) => compareLex(a.objectives, b.objectives))
}
