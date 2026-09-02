// Generated test data: a large random day for stress-testing the optimizer
// and the board UI. For a realistic hand-authored day see sample.ts.

import { pairKey, type Scores, type Slot } from './scheduler'
import { emptyProject, withParticipants, withScores, withSlotCount, type Project } from './project'

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

/** Both grids filled at random: ~45% of cells asked, mostly 1s, a few 3s. */
export function randomScores(project: Project, rand: () => number = Math.random): Project {
  const draw = () => {
    const r = rand()
    if (r > 0.94) return 3
    if (r > 0.8) return 2
    if (r > 0.55) return 1
    return 0
  }
  const dmScores: Scores = {}
  const teamScores: Scores = {}
  for (const t of project.teams) {
    for (const d of project.dms) {
      const a = draw()
      const b = draw()
      if (a) dmScores[pairKey(t.id, d.id)] = a
      if (b) teamScores[pairKey(t.id, d.id)] = b
    }
  }
  return withScores(project, dmScores, teamScores)
}

/** 26 teams × 26 decision makers × 12 slots, random interest. */
export function demoProject(seed = 20260902): Project {
  const teams = Array.from({ length: 26 }, (_, i) => `Team ${String.fromCharCode(65 + i)}`)
  const dms = Array.from({ length: 26 }, (_, i) => `DM ${i + 1}`)
  const p = withSlotCount(withParticipants(emptyProject(), teams, dms), 12)
  return randomScores(p, seededRandom(seed))
}
