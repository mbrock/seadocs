import { describe, expect, test } from 'vitest'
import { sampleProject } from './sample'
import { optimize } from './optimize'
import { asked, findIssues } from './scheduler'
import { OBJECTIVES } from './objectives'

describe('sample day', () => {
  const p = sampleProject()

  test('has the shape of the BSD 2026 first pitching day', () => {
    expect(p.teams).toHaveLength(13)
    expect(p.dms).toHaveLength(17)
    expect(p.slots).toHaveLength(9)
    expect(p.slots[0].label).toBe('15:20')
    expect(p.slots[8].label).toBe('18:00')
  })

  test('interest grids are dense enough to be interesting but not full', () => {
    const cells = p.teams.length * p.dms.length
    const dmAsked = Object.keys(p.dmAsks).length
    const teamAsked = Object.keys(p.teamAsks).length
    expect(dmAsked / cells).toBeGreaterThan(0.4)
    expect(dmAsked / cells).toBeLessThan(0.8)
    expect(teamAsked / cells).toBeGreaterThan(0.5)
    // Every team asked for someone and every DM asked for someone.
    for (const t of p.teams) expect(p.dms.some((d) => asked(p.teamAsks, t.id, d.id))).toBe(true)
    for (const d of p.dms) expect(p.teams.some((t) => asked(p.dmAsks, t.id, d.id))).toBe(true)
  })

  test('optimizer produces a valid frontier', () => {
    const front = optimize(p)
    console.log(`sample frontier: ${front.length} boards`)
    console.log(['recipe'.padEnd(26), ...OBJECTIVES.map((o) => o.key.padStart(10))].join(''))
    for (const a of front) console.log([a.recipe.padEnd(26), ...OBJECTIVES.map((o) => String(a.objectives[o.key]).padStart(10))].join(''))
    expect(front.length).toBeGreaterThan(0)
    for (const a of front) expect(findIssues(a.meetings)).toEqual([])
    // Teams are the bottleneck (13 × 9 = 117 seats vs 17 × 9 = 153), so no board
    // should leave a team's day mostly empty when it asked for meetings.
    for (const a of front) expect(a.objectives.teamsEmpty).toBe(0)
  })
})
