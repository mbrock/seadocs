import { deserialize, STORAGE_KEY } from './persist'
import { festivalFromProject, type Festival, type FestivalDay } from './festival'

export function serializeFestival(festival: Festival): string {
  return JSON.stringify({ version: 6, ...festival }, null, 1)
}

const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string')

export function deserializeFestival(text: string): Festival {
  const file: unknown = JSON.parse(text)
  if (!record(file)) throw new Error('Not a Meeting Board festival file')
  if (file.version !== 6) return festivalFromProject(deserialize(text))
  if (!Array.isArray(file.days) || file.days.length !== 2 || !Array.isArray(file.dms)) throw new Error('A festival must contain exactly two days and a shared decision-maker roster')
  const shared = file.dms
  if (!shared.every((d) => record(d) && typeof d.id === 'string' && typeof d.name === 'string' && d.unavailable === undefined)) throw new Error('Shared decision makers are malformed')
  const days = file.days.map((day): FestivalDay => {
    if (!record(day) || !record(day.dmUnavailable) || !Object.values(day.dmUnavailable).every(strings) ||
      !Array.isArray(day.slots) || !day.slots.length || day.slots.length > 60 ||
      !day.slots.every((s) => record(s) && typeof s.id === 'string' && typeof s.label === 'string') ||
      !Array.isArray(day.teams) || !day.teams.every((p) => record(p) && typeof p.id === 'string' && typeof p.name === 'string') ||
      !Array.isArray(day.meetings) || !day.meetings.every((m) => record(m) && ['team', 'dm', 'slot'].every((k) => typeof m[k] === 'string')) ||
      !record(day.dmAsks) || !record(day.teamAsks) || ![...Object.values(day.dmAsks), ...Object.values(day.teamAsks)].every((v) => v === true)) throw new Error('Festival day is malformed')
    const unavailable = day.dmUnavailable
    const dms = shared.map((dm) => ({ ...dm, unavailable: unavailable[dm.id] }))
    const project = deserialize(JSON.stringify({ ...day, version: 5, dms }))
    const slotIds = new Set(project.slots.map((s) => s.id))
    if (Object.keys(unavailable).some((id) => !shared.some((d) => d.id === id)) ||
      Object.values(unavailable).some((slots) => !strings(slots) || slots.some((id) => !slotIds.has(id))) ||
      day.teams.some((t: Record<string, unknown>) => t.unavailable !== undefined && (!strings(t.unavailable) || t.unavailable.some((id) => !slotIds.has(id))))) throw new Error('Availability refers to a missing participant or time slot')
    const { dms: _drop, ...rest } = project
    return { ...rest, dmUnavailable: Object.fromEntries(Object.entries(unavailable).filter((entry): entry is [string, string[]] => strings(entry[1]))) }
  })
  const { dms } = deserialize(JSON.stringify({ ...file.days[0], version: 5, dms: shared }))
  return { dms, days: [days[0], days[1]] }
}

export function loadFestival(): Festival | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return text ? deserializeFestival(text) : null
  } catch { return null }
}

export function saveFestival(festival: Festival): void {
  try { localStorage.setItem(STORAGE_KEY, serializeFestival(festival)) }
  catch { /* The in-memory festival still works when browser storage is unavailable. */ }
}
