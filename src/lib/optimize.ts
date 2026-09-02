// Build the Pareto frontier of schedules.
//
// 1. Several exact selections (min-cost flow) under different weightings of
//    decision-maker vs team interest, with and without "every team gets at
//    least one meeting", with and without filling spare capacity — plus the
//    simple greedy for good measure. Each is an optimum for SOME reasonable
//    notion of "best".
// 2. Every selection is fitted into slots and compacted to remove windows.
// 3. Measured on all objectives; only non-dominated schedules survive.
//
// The result is a short list of genuinely different boards. The first one
// (best in priority order) is a sensible default; the others show what the
// organiser could gain by giving something up.

import { compactSlots } from './compact'
import { selectByFlow } from './flow'
import { addToFrontier, compareLex, measure, type Objectives } from './objectives'
import {
  allPairs,
  alwaysAvailable,
  assignSlots,
  availabilityOf,
  selectMeetings,
  type Availability,
  type Meeting,
  type PlacedMeeting,
  type ScheduleInput,
  type Slot,
} from './scheduler'

export interface Alternative {
  meetings: PlacedMeeting[]
  objectives: Objectives
  /** How this board was found; for debugging and tests, not shown to users. */
  recipe: string
}

/**
 * Relative worth of a decision-maker ask vs a team ask. 'dm-first' is
 * lexicographic: its DM weight exceeds the number of ALL team asks, so no
 * amount of team interest can buy back a single DM ask — exactly the objective
 * order, so the board it finds provably meets the most DM asks. 'fair' is
 * dm-first too, but ranks team asks BELOW the solver's fair-share tie-break:
 * among boards equally good for the decision makers as a group, it spreads
 * meetings by how much each one asked for, and only then listens to the
 * teams. The other weightings let team asks buy DM asks.
 */
const WEIGHTINGS: [string, number | 'lexicographic' | 'fair', number][] = [
  ['fair', 'fair', 0],
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
export function candidateSelections(input: ScheduleInput): { recipe: string; meetings: Meeting[] }[] {
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
  const pairs = allPairs(input)
  const totalTeamAsks = pairs.filter((p) => p.teamAsked).length
  // A requested pair is worth at least REQUESTED; a filler is worth 1, so
  // fillers only ever use capacity nothing requested could use.
  const REQUESTED = pairs.length + 1
  for (const [name, dmWeight, wTeam] of WEIGHTINGS) {
    const wDm = dmWeight === 'lexicographic' || dmWeight === 'fair' ? totalTeamAsks + 1 : dmWeight
    for (const floor of [0, 1]) {
      for (const fill of [false, true]) {
        const points = (dm: boolean, team: boolean) => (dm ? wDm : 0) + (team ? wTeam : 0)
        // Under 'fair' a team ask adds nothing to a DM-asked pair (so fair share
        // decides between DM asks) but a team-only ask still outranks a filler.
        const weight = (dm: boolean, team: boolean) => REQUESTED * points(dm, team) + (dmWeight === 'fair' && team && !dm ? 1 : 0) + (fill ? 1 : 0)
        const tieBreak = dmWeight === 'fair' ? (_dm: boolean, team: boolean) => (team ? 1 : 0) : undefined
        add(`${name}${floor ? ` floor${floor}` : ''}${fill ? ' fill' : ''}`, selectByFlow(input, { weight, teamFloor: floor, tieBreak }))
      }
    }
  }
  return out
}

/** Fit a selection into slots with as few windows as possible. */
export function placeCompactly(meetings: Meeting[], slots: Slot[], available: Availability = alwaysAvailable): PlacedMeeting[] {
  return compactSlots(assignSlots(meetings, slots, available), slots, available)
}

/** The frontier, best-first in objective priority order. */
export function optimize(input: ScheduleInput): Alternative[] {
  const available = availabilityOf([...input.teams, ...input.dms])
  let frontier: Alternative[] = []
  for (const { recipe, meetings } of candidateSelections(input)) {
    const placed = placeCompactly(meetings, input.slots, available)
    frontier = addToFrontier(frontier, { meetings: placed, objectives: measure(input, placed), recipe }, (a) => a.objectives)
  }
  return frontier.sort((a, b) => compareLex(a.objectives, b.objectives))
}
