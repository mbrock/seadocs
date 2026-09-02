// Project files and browser storage.
//
// The file is the project as JSON plus a format version. Older formats are
// migrated on read:
//   v1  the original single-file prototype: names as strings, scores keyed by
//       list position, board as a slot × dm matrix of team indices
//   v2  participants with ids, `slotCount` + `slotLabels`, meetings with slot
//       positions
//   v3  slots are entities with ids; meetings refer to slot ids; interest as
//       0–3 scores (`dmScores`, `teamScores`)
//   v4  interest is either/or: `dmAsks` and `teamAsks` are lists of pair keys.
//       Any v1–v3 score above zero becomes an ask.

import { pairKey, type Asks, type Participant, type PlacedMeeting, type Slot } from './scheduler'
import { emptyProject, prune, type Project } from './project'

export const FORMAT_VERSION = 4
export const STORAGE_KEY = 'meeting-board/project'

export function serialize(project: Project): string {
  const { dmAsks, teamAsks, ...rest } = project
  const file = { version: FORMAT_VERSION, savedAt: new Date().toISOString(), ...rest, dmAsks: Object.keys(dmAsks).sort(), teamAsks: Object.keys(teamAsks).sort() }
  return JSON.stringify(file, null, 1)
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

/** v3 and v4 differ only in how interest is stored. */
function fromV3(d: Record<string, unknown>): Project {
  const slots = Array.isArray(d.slots) ? d.slots.filter(isSlot).map(({ id, label }) => ({ id, label })) : []
  return prune({
    ...emptyProject(),
    title: typeof d.title === 'string' ? d.title : '',
    teams: (d.teams as Participant[]).map(cleanParticipant),
    dms: (d.dms as Participant[]).map(cleanParticipant),
    slots: slots.length ? slots : emptyProject().slots,
    dmAsks: cleanAsks(d.dmAsks ?? d.dmScores),
    teamAsks: cleanAsks(d.teamAsks ?? d.teamScores),
    meetings: Array.isArray(d.meetings) ? d.meetings.filter(isMeeting) : [],
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
    dmAsks: cleanAsks(d.dmScores),
    teamAsks: cleanAsks(d.teamScores),
    meetings,
    nextId,
  })
}

function fromV1(d: Record<string, unknown>): Project {
  const teams: Participant[] = (d.teams as unknown[]).map((name, i) => ({ id: `t${i + 1}`, name: String(name) }))
  const dms: Participant[] = (d.dms as unknown[]).map((name, i) => ({ id: `d${i + 1}`, name: String(name) }))
  const { slots, nextId } = slotsFromCount(d.slotCount, d.slotLabels, teams.length + dms.length + 1)
  const convert = (scores: unknown): Asks => {
    const out: Asks = {}
    if (!isRecord(scores)) return out
    for (const [k, v] of Object.entries(scores)) {
      const [ti, di] = k.split('_').map(Number)
      if (teams[ti] && dms[di] && Number(v) > 0) out[pairKey(teams[ti].id, dms[di].id)] = true
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
    dmAsks: convert(d.dmScores),
    teamAsks: convert(d.teamScores),
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

function cleanParticipant({ id, name, online, code, unavailable }: Participant): Participant {
  const p: Participant = { id, name }
  if (online === true) p.online = true
  if (typeof code === 'string' && code.trim()) p.code = code.trim()
  if (Array.isArray(unavailable) && unavailable.length) p.unavailable = unavailable.filter((s) => typeof s === 'string')
  return p
}

function isSlot(s: unknown): s is Slot {
  return isRecord(s) && typeof s.id === 'string' && typeof s.label === 'string'
}

function isMeeting(m: unknown): m is PlacedMeeting {
  return isRecord(m) && typeof m.team === 'string' && typeof m.dm === 'string' && typeof m.slot === 'string'
}

/** v4 lists pair keys; v3 mapped pair keys to scores, where anything above zero was an ask. */
function cleanAsks(x: unknown): Asks {
  const out: Asks = {}
  if (Array.isArray(x)) {
    for (const k of x) if (typeof k === 'string' && k.includes('|')) out[k] = true
  } else if (isRecord(x)) {
    for (const [k, v] of Object.entries(x)) if (Number(v) > 0) out[k] = true
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
