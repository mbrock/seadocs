// Boards described in words: what one trades against another, how good one is.

import { ASK_OBJECTIVES, OBJECTIVES, type ObjectiveKey, type Objectives } from './objectives'
import type { Alternative } from './optimize'

const UNIT: Record<ObjectiveKey, [string, string]> = {
  missedDm: ['DM ask', 'DM asks'],
  dmsUnderHalf: ['DM under half', 'DMs under half'],
  teamsEmpty: ['team left out', 'teams left out'],
  dmGaps: ['DM window', 'DM windows'],
  missedTeam: ['team ask', 'team asks'],
  fillers: ['filler', 'fillers'],
  teamGaps: ['team window', 'team windows'],
}

/** Who asked for a pair, in words. */
export function askedBy(dm: boolean, team: boolean): string {
  return dm && team ? 'both asked' : dm ? 'decision maker asked' : team ? 'team asked' : 'nobody asked'
}

const plural = (n: number, key: ObjectiveKey) => `${n} ${UNIT[key][n === 1 ? 0 : 1]}`
export const isAsk = (key: ObjectiveKey) => key in ASK_OBJECTIVES

export interface AlternativeName {
  name: string
  /** What this board gains over the recommended one, e.g. "1 more team ask met". */
  gain: string
  /** What it gives up, e.g. "costs 6 interested asks, 2 DM windows". */
  cost: string
}

/**
 * Name each board by what it trades against the recommended one: the
 * highest-priority objective where it does better, and everything where it
 * does worse. The recommended board is best in priority order.
 */
export function nameAlternatives(alternatives: Alternative[]): AlternativeName[] {
  const base = alternatives[0]?.objectives
  return alternatives.map((a, i) => {
    if (i === 0) return { name: 'Recommended', gain: '', cost: '' }
    const win = OBJECTIVES.find(({ key }) => a.objectives[key] < base[key])
    const losses = OBJECTIVES.filter(({ key }) => a.objectives[key] > base[key]).map(({ key }) => plural(a.objectives[key] - base[key], key))
    const gain = win ? `${base[win.key] - a.objectives[win.key]} ${isAsk(win.key) ? 'more' : 'fewer'} ${UNIT[win.key][base[win.key] - a.objectives[win.key] === 1 ? 0 : 1]}${isAsk(win.key) ? ' met' : ''}` : ''
    const name = win ? (isAsk(win.key) ? `More ${UNIT[win.key][1]} met` : `Fewer ${UNIT[win.key][1]}`) : `Board ${i + 1}`
    return { name, gain, cost: losses.length ? `costs ${losses.join(', ')}` : '' }
  })
}

/** One sentence on how good a board is, in the words of the objectives. */
export function describe(o: Objectives, requested: Partial<Record<ObjectiveKey, number>>): string {
  const parts: string[] = []
  const dm = requested.missedDm ?? 0
  if (dm) parts.push(o.missedDm === 0 ? 'every DM ask' : `${dm - o.missedDm} of ${dm} DM asks`)
  if (requested.missedTeam) parts.push(`${requested.missedTeam - o.missedTeam} of ${requested.missedTeam} team asks`)
  const tail: string[] = []
  if (o.dmGaps) tail.push(plural(o.dmGaps, 'dmGaps'))
  if (o.teamsEmpty) tail.push(plural(o.teamsEmpty, 'teamsEmpty'))
  if (o.fillers) tail.push(plural(o.fillers, 'fillers'))
  return [parts.join(', '), tail.join(', ')].filter(Boolean).join(' · ')
}
