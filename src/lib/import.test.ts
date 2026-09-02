import { describe, expect, it } from 'vitest'
import { parseInterestGrid } from './import'
import { interestCsv } from './csv'
import { sampleProject } from './sample'

const teams = [
  { id: 't1', name: 'The Crust of Europe' },
  { id: 't2', name: 'Evening School' },
]
const dms = [
  { id: 'd1', name: 'Rebecca Heiler | goEast, Germany' },
  { id: 'd2', name: 'José Lorenzo Benitez Cornejo | 3Box Media, Spain' },
]

describe('parseInterestGrid', () => {
  it('reads a tab-separated sheet with DMs as rows and loose names', () => {
    const text = ['\tEUROPE\tevening school\tUnknown Film', 'Rebecca Heiler\tx\t\t1', 'Jose Lorenzo Benitez Cornejo | 3Box Media, Spain\tx\t2\t', 'Nobody\t1\t1\t1'].join('\n')
    const r = parseInterestGrid(text, teams, dms)!
    expect(r.rows).toBe('dm')
    expect(r.asks).toEqual({ 't1|d1': true, 't1|d2': true, 't2|d2': true })
    expect(r.matchedTeams).toBe(2)
    expect(r.matchedDms).toBe(2)
    expect(r.unmatched).toEqual(['Unknown Film', 'Nobody'])
    expect(r.unreadable).toBe(0)
  })
  it('accepts teams as rows and counts unreadable cells', () => {
    const text = ['Team,Heiler,Cornejo', 'The Crust of Europe,yes,maybe', '"Evening School",,x'].join('\n')
    const r = parseInterestGrid(text, teams, dms)!
    expect(r.rows).toBe('team')
    expect(r.asks).toEqual({ 't1|d1': true, 't2|d2': true })
    expect(r.unreadable).toBe(1)
  })
  it('round-trips the exported grid', () => {
    const p = sampleProject()
    const r = parseInterestGrid(interestCsv(p, 'dm'), p.teams, p.dms)!
    expect(r.asks).toEqual(p.dmAsks)
    expect(r.unmatched).toEqual([])
  })
  it('returns null for nothing recognisable', () => {
    expect(parseInterestGrid('hello', teams, dms)).toBeNull()
    expect(parseInterestGrid('a,b\nc,d', teams, dms)).toBeNull()
  })
})
