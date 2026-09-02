// Project files and browser storage.
//
// The file is the project as JSON plus a format version. Older formats are
// migrated on read:
//   v1  the original single-file prototype: names as strings, scores keyed by
//       list position, board as a slot × dm matrix of team indices
//   v2  participants with ids, `slotCount` + `slotLabels`, meetings with slot
//       positions
//   v3  slots are entities with ids; meetings refer to slot ids

import { MAX_SCORE, pairKey, type Participant, type PlacedMeeting, type Scores, type Slot } from './scheduler'
import { cleanFloor, emptyProject, prune, type Project } from './project'

export const FORMAT_VERSION = 3
export const STORAGE_KEY = 'meeting-board/project'

export function serialize(project: Project): string {
  return JSON.stringify({ version: FORMAT_VERSION, savedAt: new Date().toISOString(), ...project }, null, 1)
}

export function deserialize(text: string): Project {
  const d: unknown = JSON.parse(text)
  if (!isRecord(d) || !Array.isArray(d.teams) || !Array.isArray(d.dms)) {
    throw new Error('Not a Meeting Board project file')
  }
  if (d.version === 1 || d.teams.some((t) => typeof t === 'string')) return fromV1(d)
  if (!d.teams.every(isParticipant) || !d.dms.every(isParticipant)) {
    throw new Error('Participants are malformed')
  }
  return d.version === 2 ? fromV2(d) : fromV3(d)
}

function fromV3(d: Record<string, unknown>): Project {
  const slots = Array.isArray(d.slots) ? d.slots.filter(isSlot).map(({ id, label }) => ({ id, label })) : []
  return prune({
    ...emptyProject(),
    teams: (d.teams as Participant[]).map(cleanParticipant),
    dms: (d.dms as Participant[]).map(cleanParticipant),
    slots: slots.length ? slots : emptyProject().slots,
    dmScores: cleanScores(d.dmScores),
    teamScores: cleanScores(d.teamScores),
    meetings: Array.isArray(d.meetings) ? d.meetings.filter(isMeeting) : [],
    teamFloor: cleanFloor(d.teamFloor),
    nextId: Number(d.nextId) || 1,
  })
}

/** Turn a slot count and optional labels into slot entities, numbering from `nextId`. */
function slotsFromCount(count: unknown, labels: unknown, nextId: number): { slots: Slot[]; nextId: number } {
  const n = Number(count) || 10
  const names = Array.isArray(labels) ? labels.map(String) : []
  const slots = Array.from({ length: n }, (_, i) => ({ id: `s${nextId + i}`, label: names[i] ?? '' }))
  return { slots, nextId: nextId + n }
}

function fromV2(d: Record<string, unknown>): Project {
  const { slots, nextId } = slotsFromCount(d.slotCount, d.slotLabels, Number(d.nextId) || 1)
  const meetings: PlacedMeeting[] = []
  if (Array.isArray(d.meetings)) {
    for (const m of d.meetings) {
      if (isRecord(m) && typeof m.team === 'string' && typeof m.dm === 'string' && typeof m.slot === 'number' && slots[m.slot]) {
        meetings.push({ team: m.team, dm: m.dm, slot: slots[m.slot].id })
      }
    }
  }
  return prune({
    ...emptyProject(),
    teams: (d.teams as Participant[]).map(cleanParticipant),
    dms: (d.dms as Participant[]).map(cleanParticipant),
    slots,
    dmScores: cleanScores(d.dmScores),
    teamScores: cleanScores(d.teamScores),
    meetings,
    teamFloor: cleanFloor(d.teamFloor),
    nextId,
  })
}

function fromV1(d: Record<string, unknown>): Project {
  const teams: Participant[] = (d.teams as unknown[]).map((name, i) => ({ id: `t${i + 1}`, name: String(name) }))
  const dms: Participant[] = (d.dms as unknown[]).map((name, i) => ({ id: `d${i + 1}`, name: String(name) }))
  const { slots, nextId } = slotsFromCount(d.slotCount, d.slotLabels, teams.length + dms.length + 1)
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
    d.schedule.forEach((row: unknown, si: number) => {
      if (!Array.isArray(row) || !slots[si]) return
      row.forEach((ti: unknown, di: number) => {
        if (typeof ti === 'number' && teams[ti] && dms[di]) meetings.push({ team: teams[ti].id, dm: dms[di].id, slot: slots[si].id })
      })
    })
  }
  return prune({
    ...emptyProject(),
    teams,
    dms,
    slots,
    dmScores: convert(d.dmScores),
    teamScores: convert(d.teamScores),
    meetings,
    nextId,
  })
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isParticipant(p: unknown): p is Participant {
  return isRecord(p) && typeof p.id === 'string' && typeof p.name === 'string'
}

function cleanParticipant({ id, name, online }: Participant): Participant {
  return online === true ? { id, name, online } : { id, name }
}

function isSlot(s: unknown): s is Slot {
  return isRecord(s) && typeof s.id === 'string' && typeof s.label === 'string'
}

function isMeeting(m: unknown): m is PlacedMeeting {
  return isRecord(m) && typeof m.team === 'string' && typeof m.dm === 'string' && typeof m.slot === 'string'
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
