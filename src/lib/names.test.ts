import { describe, expect, it } from 'vitest'
import { countryCode, displayNames, initialSurname, parseName, titleWord, titleWords } from './names'

describe('parseName', () => {
  it('splits person, organisation and country', () => {
    expect(parseName('José Lorenzo Benitez Cornejo | 3Box Media, Spain')).toEqual({
      person: 'José Lorenzo Benitez Cornejo',
      org: '3Box Media',
      country: 'Spain',
    })
  })
  it('keeps commas inside the organisation', () => {
    expect(parseName('X | Rise, Shine and Co, Germany')).toEqual({ person: 'X', org: 'Rise, Shine and Co', country: 'Germany' })
  })
  it('handles names without affiliation or country', () => {
    expect(parseName('Concrete Grassland')).toEqual({ person: 'Concrete Grassland', org: '', country: '' })
    expect(parseName('A B | Org')).toEqual({ person: 'A B', org: 'Org', country: '' })
  })
})

describe('initialSurname', () => {
  it('takes the first initial and the last word', () => {
    expect(initialSurname('José Lorenzo Benitez Cornejo')).toBe('J. Cornejo')
    expect(initialSurname('Astrid Bjerregaard Nielsen')).toBe('A. Nielsen')
  })
  it('ignores bracketed nicknames', () => {
    expect(initialSurname('Gunny (Gune) Hyoung')).toBe('G. Hyoung')
  })
  it('leaves single words alone', () => {
    expect(initialSurname('Madonna')).toBe('Madonna')
  })
})

describe('countryCode', () => {
  it('maps known countries and passes codes through', () => {
    expect(countryCode('Germany')).toBe('DE')
    expect(countryCode('South Korea')).toBe('KR')
    expect(countryCode('UK')).toBe('UK')
    expect(countryCode('')).toBe('')
  })
  it('returns unknown countries verbatim', () => {
    expect(countryCode('Narnia')).toBe('Narnia')
  })
})

describe('displayNames', () => {
  it('abbreviates people with affiliations and leaves titles alone', () => {
    const names = displayNames([
      { id: 'd1', name: 'Rebecca Heiler | goEast, Germany' },
      { id: 't1', name: '14,5 km Away From Our Dreams' },
    ])
    expect(names.get('d1')).toEqual({ short: 'R. Heiler', code: 'Heiler', tag: 'DE', affiliation: 'goEast, Germany' })
    expect(names.get('t1')).toEqual({ short: '14,5 km Away From Our Dreams', code: 'Dreams', tag: '', affiliation: '' })
  })
  it('falls back to full names when abbreviations collide', () => {
    const names = displayNames([
      { id: 'a', name: 'Anna Nielsen | DR, Denmark' },
      { id: 'b', name: 'Astrid Nielsen | SVT, Sweden' },
      { id: 'c', name: 'Bo Berg | NRK, Norway' },
    ])
    expect(names.get('a')?.short).toBe('Anna Nielsen')
    expect(names.get('b')?.short).toBe('Astrid Nielsen')
    expect(names.get('c')?.short).toBe('B. Berg')
  })
})

describe('titleWord', () => {
  it('picks the word a crew would use for each BSD 2026 title', () => {
    const expected: [string, string][] = [
      ['14,5 km Away From Our Dreams', 'Dreams'],
      ['35 Letters', 'Letters'],
      ['Borderline', 'Borderline'],
      ['Concrete Grassland', 'Grassland'],
      ['Cords of Bliss', 'Bliss'],
      ['The Crust of Europe', 'Europe'],
      ['Encounters/Departures', 'Encounters'],
      ['Evening School', 'Evening'],
      ['Going Underground', 'Underground'],
      ['Keepers of the City', 'Keepers'],
      ['Lunatics', 'Lunatics'],
      ['Mariana’s Lament', 'Lament'],
      ['Master of Ceremonies', 'Ceremonies'],
    ]
    for (const [title, word] of expected) expect(titleWord(title), title).toBe(word)
  })
  it('falls back to generic words when nothing else is left, and to nothing when no words qualify', () => {
    expect(titleWord('The City')).toBe('City')
    expect(titleWord('1984')).toBe('')
    expect(titleWord('Us')).toBe('')
  })
})

describe('titleWords', () => {
  it('disambiguates titles that share a word', () => {
    expect(titleWords(['The Crust of Europe', 'Little Europe', 'Cords of Bliss'])).toEqual(['Crust Europe', 'Little Europe', 'Bliss'])
  })
  it('uses the whole title when no word qualifies', () => {
    expect(titleWords(['1984', 'Us'])).toEqual(['1984', 'Us'])
  })
})
