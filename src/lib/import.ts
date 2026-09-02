// Reading an interest grid pasted from a spreadsheet.
//
// Asks are usually collected in a sheet, not typed into this app cell by
// cell. The organiser copies the sheet and pastes it here: a header row of
// names, a first column of names, and a mark (x, 1, yes…) in the cells where
// there is an ask. Either side may be
// the rows; names are matched loosely (case, accents, "Name | Org" vs "Name",
// the short code) so that a sheet kept by hand still lines up.

import { parseName, displayNames } from './names'
import type { Asks, Id, Participant } from './scheduler'
import { pairKey } from './scheduler'

export interface GridImport {
  /** The parsed grid, keyed like the project's ask tables. */
  asks: Asks
  /** Which side the rows were (columns are the other). */
  rows: 'dm' | 'team'
  matchedTeams: number
  matchedDms: number
  /** Row and column labels that matched nobody. */
  unmatched: string[]
  /** Cells that were neither blank, a "no" (0, -, no) nor a mark (x, ✓, yes, 1–3). */
  unreadable: number
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Every spelling we accept for a participant, folded. */
function aliases(p: Participant, code: string | undefined): string[] {
  const { person } = parseName(p.name)
  return [p.name, person, code ?? ''].filter(Boolean).map(fold)
}

function matcher(people: Participant[]): (label: string) => Id | null {
  const names = displayNames(people)
  const table = new Map<string, Id>()
  for (const p of people) for (const a of aliases(p, names.get(p.id)?.code)) if (!table.has(a)) table.set(a, p.id)
  return (label) => table.get(fold(label)) ?? null
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') return line.split(delimiter).map((c) => c.trim())
  // Minimal CSV: quoted cells may contain commas and doubled quotes.
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** true = asked, false = not asked, null = unreadable. Old 0–3 sheets still read: anything above 0 is an ask. */
function cellAsk(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (v === '' || v === '-' || v === '–' || v === '0' || v === 'no') return false
  if (/^[1-9]$/.test(v) || v === 'x' || v === '✓' || v === 'yes' || v === 'y') return true
  return null
}

export function parseInterestGrid(text: string, teams: Participant[], dms: Participant[]): GridImport | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const grid = lines.map((l) => splitLine(l, delimiter))
  const header = grid[0].slice(1)
  const rowLabels = grid.slice(1).map((r) => r[0] ?? '')

  const matchTeam = matcher(teams)
  const matchDm = matcher(dms)
  // Whichever orientation matches more labels wins.
  const count = (labels: string[], match: (s: string) => Id | null) => labels.filter((l) => match(l)).length
  const teamsAcross = count(header, matchTeam) + count(rowLabels, matchDm)
  const dmsAcross = count(header, matchDm) + count(rowLabels, matchTeam)
  if (teamsAcross === 0 && dmsAcross === 0) return null
  const rows: 'dm' | 'team' = teamsAcross >= dmsAcross ? 'dm' : 'team'
  const colIds = header.map(rows === 'dm' ? matchTeam : matchDm)
  const rowIds = rowLabels.map(rows === 'dm' ? matchDm : matchTeam)

  const asks: Asks = {}
  let unreadable = 0
  grid.slice(1).forEach((cells, r) => {
    const rowId = rowIds[r]
    if (!rowId) return
    colIds.forEach((colId, c) => {
      if (!colId) return
      const a = cellAsk(cells[c + 1] ?? '')
      if (a === null) unreadable++
      else if (a) asks[rows === 'dm' ? pairKey(colId, rowId) : pairKey(rowId, colId)] = true
    })
  })
  const unmatched = [...header.filter((_, i) => !colIds[i]), ...rowLabels.filter((_, i) => !rowIds[i])].filter((l) => l.trim())
  const matchedCols = new Set(colIds.filter(Boolean)).size
  const matchedRows = new Set(rowIds.filter(Boolean)).size
  return {
    asks,
    rows,
    matchedTeams: rows === 'dm' ? matchedCols : matchedRows,
    matchedDms: rows === 'dm' ? matchedRows : matchedCols,
    unmatched,
    unreadable,
  }
}
