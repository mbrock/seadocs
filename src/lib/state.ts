// The project model and everything that turns it into/out of text.
// All functions return a new project; nothing here mutates its input.
//
// Participants have stable ids so that renaming the lists, reordering them, or
// deleting one entry never shifts everybody else's interest scores around.

import { MAX_SCORE, pairKey, type Id, type Participant, type PlacedMeeting, type Scores } from './scheduler'

export const FORMAT_VERSION = 2
export const STORAGE_KEY = 'meeting-board/project'
export const MAX_SLOTS = 60

export type ScoreKind = 'dm' | 'team'

export interface Project {
  version: typeof FORMAT_VERSION
  teams: Participant[]
  dms: Participant[]
  slotCount: number
  /** Labels as typed; missing ones are derived by slotLabel(). */
  slotLabels: string[]
  dmScores: Scores
  teamScores: Scores
  meetings: PlacedMeeting[]
  /** Every team should get at least this many meetings (an objective, not a hard rule). */
  teamFloor: number
  nextId: number
}

export function emptyProject(): Project {
  return {
    version: FORMAT_VERSION,
    teams: [],
    dms: [],
    slotCount: 10,
    slotLabels: [],
    dmScores: {},
    teamScores: {},
    meetings: [],
    teamFloor: 1,
    nextId: 1,
  }
}

/** One name per line, trimmed, blanks and duplicates dropped. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const name = raw.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function slotLabel(project: Project, slot: number): string {
  return project.slotLabels[slot] || `Slot ${slot + 1}`
}

export function participantName(project: Project, id: Id): string {
  const p = project.teams.find((t) => t.id === id) ?? project.dms.find((d) => d.id === id)
  return p ? p.name : id
}

/** Replace the participant lists, keeping ids (and so scores) for names that still exist. */
export function withParticipants(project: Project, teamNames: string[], dmNames: string[]): Project {
  const counter = { next: project.nextId }
  const teams = reconcile(project.teams, teamNames, 't', counter)
  const dms = reconcile(project.dms, dmNames, 'd', counter)
  return prune({ ...project, teams, dms, nextId: counter.next })
}

function reconcile(existing: Participant[], names: string[], prefix: string, counter: { next: number }): Participant[] {
  const byName = new Map(existing.map((p) => [p.name, p]))
  return names.map((name) => byName.get(name) ?? { id: `${prefix}${counter.next++}`, name })
}

export function withSlots(project: Project, slotCount: number | string, slotLabels: string[]): Project {
  const n = Math.min(MAX_SLOTS, Math.max(1, Math.floor(Number(slotCount)) || 1))
  return prune({ ...project, slotCount: n, slotLabels: [...slotLabels] })
}

export function withTeamFloor(project: Project, teamFloor: number | string): Project {
  return { ...project, teamFloor: cleanFloor(teamFloor) }
}

/** Drop scores and meetings that refer to participants or slots that no longer exist. */
function prune(project: Project): Project {
  const teamIds = new Set(project.teams.map((t) => t.id))
  const dmIds = new Set(project.dms.map((d) => d.id))
  const keep = (scores: Scores): Scores =>
    Object.fromEntries(
      Object.entries(scores).filter(([k, v]) => {
        const [t, d] = k.split('|')
        return v > 0 && teamIds.has(t) && dmIds.has(d)
      }),
    )
  const meetings = project.meetings.filter((m) => teamIds.has(m.team) && dmIds.has(m.dm) && m.slot < project.slotCount)
  return { ...project, dmScores: keep(project.dmScores), teamScores: keep(project.teamScores), meetings }
}

export function withScore(project: Project, kind: ScoreKind, teamId: Id, dmId: Id, score: number): Project {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores'
  const scores = { ...project[field] }
  const k = pairKey(teamId, dmId)
  if (score > 0) scores[k] = score
  else delete scores[k]
  return { ...project, [field]: scores }
}

export function cycleScore(project: Project, kind: ScoreKind, teamId: Id, dmId: Id): Project {
  const field = kind === 'dm' ? 'dmScores' : 'teamScores'
  const cur = project[field][pairKey(teamId, dmId)] || 0
  return withScore(project, kind, teamId, dmId, (cur + 1) % (MAX_SCORE + 1))
}

export function withScores(project: Project, dmScores: Scores, teamScores: Scores): Project {
  return prune({ ...project, dmScores, teamScores })
}

export function withMeetings(project: Project, meetings: PlacedMeeting[]): Project {
  return { ...project, meetings }
}

// ---------- Files ----------

export function serialize(project: Project): string {
  return JSON.stringify({ ...project, version: FORMAT_VERSION, savedAt: new Date().toISOString() }, null, 1)
}

/** Accepts v2 files and the v1 files written by the original single-file prototype. */
export function deserialize(text: string): Project {
  const d: unknown = JSON.parse(text)
  if (!isRecord(d) || !Array.isArray(d.teams) || !Array.isArray(d.dms)) {
    throw new Error('Not a Meeting Board project file')
  }
  if (d.version === 1 || d.teams.some((t) => typeof t === 'string')) return fromV1(d)

  if (!d.teams.every(isParticipant) || !d.dms.every(isParticipant)) {
    throw new Error('Participants are malformed')
  }
  const base = emptyProject()
  return prune({
    ...base,
    teams: d.teams.map(({ id, name }) => ({ id, name })),
    dms: d.dms.map(({ id, name }) => ({ id, name })),
    slotCount: Number(d.slotCount) || base.slotCount,
    slotLabels: Array.isArray(d.slotLabels) ? d.slotLabels.map(String) : [],
    dmScores: cleanScores(d.dmScores),
    teamScores: cleanScores(d.teamScores),
    meetings: Array.isArray(d.meetings) ? d.meetings.filter(isMeeting) : [],
    teamFloor: cleanFloor(d.teamFloor),
    nextId: Number(d.nextId) || 1,
  })
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isParticipant(p: unknown): p is Participant {
  return isRecord(p) && typeof p.id === 'string' && typeof p.name === 'string'
}

function isMeeting(m: unknown): m is PlacedMeeting {
  return isRecord(m) && typeof m.team === 'string' && typeof m.dm === 'string' && Number.isInteger(m.slot) && (m.slot as number) >= 0
}

function cleanFloor(x: unknown): number {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_SLOTS) : emptyProject().teamFloor
}

function cleanScores(scores: unknown): Scores {
  if (!isRecord(scores)) return {}
  const out: Scores = {}
  for (const [k, v] of Object.entries(scores)) {
    const n = Number(v)
    if (n >= 1 && n <= MAX_SCORE) out[k] = Math.floor(n)
  }
  return out
}

function fromV1(d: Record<string, unknown>): Project {
  const teams: Participant[] = (d.teams as unknown[]).map((name, i) => ({ id: `t${i + 1}`, name: String(name) }))
  const dms: Participant[] = (d.dms as unknown[]).map((name, i) => ({ id: `d${i + 1}`, name: String(name) }))
  const convert = (scores: unknown): Scores => {
    const out: Scores = {}
    if (!isRecord(scores)) return out
    for (const [k, v] of Object.entries(scores)) {
      const [ti, di] = k.split('_').map(Number)
      const n = Number(v)
      if (teams[ti] && dms[di] && n > 0) out[pairKey(teams[ti].id, dms[di].id)] = Math.min(MAX_SCORE, n)
    }
    return out
  }
  const meetings: PlacedMeeting[] = []
  if (Array.isArray(d.schedule)) {
    d.schedule.forEach((row: unknown, slot: number) => {
      if (!Array.isArray(row)) return
      row.forEach((ti: unknown, di: number) => {
        if (typeof ti === 'number' && teams[ti] && dms[di]) meetings.push({ team: teams[ti].id, dm: dms[di].id, slot })
      })
    })
  }
  return prune({
    ...emptyProject(),
    teams,
    dms,
    slotCount: Number(d.slotCount) || 10,
    slotLabels: Array.isArray(d.slotLabels) ? d.slotLabels.map(String) : [],
    dmScores: convert(d.dmScores),
    teamScores: convert(d.teamScores),
    meetings,
    nextId: teams.length + dms.length + 1,
  })
}

// ---------- Browser storage ----------

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadLocal(storage = defaultStorage()): Project | null {
  try {
    const text = storage?.getItem(STORAGE_KEY)
    return text ? deserialize(text) : null
  } catch {
    return null
  }
}

export function saveLocal(project: Project, storage = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, serialize(project))
  } catch {
    // Storage full or unavailable: the in-memory project still works.
  }
}

export function clearLocal(storage = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// ---------- Demo data ----------

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

export function demoProject(seed = 20260902): Project {
  const teams = Array.from({ length: 26 }, (_, i) => `Team ${String.fromCharCode(65 + i)}`)
  const dms = Array.from({ length: 26 }, (_, i) => `DM ${i + 1}`)
  let p = withParticipants(emptyProject(), teams, dms)
  p = withSlots(p, 12, [])
  return randomScores(p, seededRandom(seed))
}
