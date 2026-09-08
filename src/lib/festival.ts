import { emptyProject, prune, withSlots, type Project } from './project'
import type { Participant } from './scheduler'

export type DayIndex = 0 | 1
export const DAY_INDICES: DayIndex[] = [0, 1]
export interface FestivalDay extends Omit<Project, 'dms'> {
  dmUnavailable: Record<string, string[]>
}
export interface Festival {
  dms: Omit<Participant, 'unavailable'>[]
  days: [FestivalDay, FestivalDay]
}

export function quarterHourSlots(start: string, count: number): string[] {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !Number.isInteger(count) || count < 1 || count > 60) return []
  const [hours, minutes] = start.split(':').map(Number)
  const first = hours * 60 + minutes
  if (first + count * 15 > 24 * 60) return []
  const time = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  return Array.from({ length: count }, (_, i) => `${time(first + i * 15)}–${time(first + (i + 1) * 15)}`)
}

function splitDay({ dms, ...day }: Project): FestivalDay {
  return { ...day, dmUnavailable: Object.fromEntries(dms.filter((d) => d.unavailable?.length).map((d) => [d.id, d.unavailable!])) }
}

export function festivalFromProject(project: Project): Festival {
  const second = withSlots({ ...emptyProject(), slots: [], nextId: project.nextId }, quarterHourSlots('15:00', 12))
  return {
    dms: project.dms.map(({ unavailable: _drop, ...dm }) => dm),
    days: [splitDay(project), splitDay(second)],
  }
}

export function emptyFestival(): Festival {
  return festivalFromProject(withSlots(emptyProject(), quarterHourSlots('15:00', 12)))
}

/** Adapt one day to the existing solver and board contract. Availability stays day-local. */
export function festivalProject(festival: Festival, day: DayIndex): Project {
  const { dmUnavailable, ...project } = festival.days[day]
  return {
    ...project,
    nextId: Math.max(...festival.days.map((d) => d.nextId)),
    dms: festival.dms.map((d) => dmUnavailable[d.id]?.length ? { ...d, unavailable: dmUnavailable[d.id] } : d),
  }
}

/** Share roster identity changes, never another day's availability or schedule edits. */
export function withFestivalDay(festival: Festival, day: DayIndex, project: Project): Festival {
  const dms = project.dms.map(({ unavailable: _drop, ...dm }) => dm)
  const other: DayIndex = day === 0 ? 1 : 0
  const next: Festival = { dms, days: [...festival.days] }
  next.days[day] = splitDay(project)
  // Prune references only if a shared DM was removed. Preserve the other day's data otherwise.
  if (festival.dms.some((dm) => !dms.some((d) => d.id === dm.id))) {
    next.days[other] = splitDay(prune(festivalProject(next, other)))
  }
  return next
}
