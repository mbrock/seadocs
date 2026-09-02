// Generated test data: a large random day for stress-testing the optimizer
// and the board UI. For a realistic hand-authored day see sample.ts.

import { pairKey, type Asks, type Slot } from './scheduler'
import { emptyProject, withAsks, withParticipants, withSlotCount, type Project } from './project'

/** Slots s1…sn with empty labels, for tests and ad-hoc inputs. */
export function numberedSlots(n: number): Slot[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, label: '' }))
}

/** Small deterministic PRNG (mulberry32) so the demo looks the same every time. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Both grids filled at random: ~45% of cells asked. */
export function randomAsks(project: Project, rand: () => number = Math.random): Project {
  const dmAsks: Asks = {}
  const teamAsks: Asks = {}
  for (const t of project.teams) {
    for (const d of project.dms) {
      if (rand() > 0.55) dmAsks[pairKey(t.id, d.id)] = true
      if (rand() > 0.55) teamAsks[pairKey(t.id, d.id)] = true
    }
  }
  return withAsks(project, dmAsks, teamAsks)
}

/** 26 teams × 26 decision makers × 12 slots, random interest. */
export function demoProject(seed = 20260902): Project {
  const teams = Array.from({ length: 26 }, (_, i) => `Team ${String.fromCharCode(65 + i)}`)
  const dms = Array.from({ length: 26 }, (_, i) => `DM ${i + 1}`)
  const p = withSlotCount(withParticipants(emptyProject(), teams, dms), 12)
  return randomAsks(p, seededRandom(seed))
}
