// Short forms of participant names for dense tables.
//
// Decision makers are entered as "First Last | Organisation, Country". In a
// board cell that becomes "J. Cornejo" with a small "ES" tag: initial, surname,
// country. Teams are project titles and have no short form.

import type { Id, Participant } from './scheduler'

export interface ParsedName {
  /** The part before "|": the person's name (or the project title). */
  person: string
  /** The part after "|", if any, minus the trailing country. */
  org: string
  /** The last comma-separated segment of the affiliation, if there is one. */
  country: string
}

export function parseName(name: string): ParsedName {
  const bar = name.indexOf('|')
  if (bar < 0) return { person: name.trim(), org: '', country: '' }
  const person = name.slice(0, bar).trim()
  const affiliation = name.slice(bar + 1).trim()
  const comma = affiliation.lastIndexOf(',')
  if (comma < 0) return { person, org: affiliation, country: '' }
  return { person, org: affiliation.slice(0, comma).trim(), country: affiliation.slice(comma + 1).trim() }
}

/** "José Lorenzo Benitez Cornejo" → "J. Cornejo"; single words stay as they are. */
export function initialSurname(person: string): string {
  const words = person.split(/\s+/).filter((w) => w && !/^\(.*\)$/.test(w))
  if (words.length < 2) return person
  return `${words[0][0]}. ${words[words.length - 1]}`
}

const COUNTRY_CODES: Record<string, string> = {
  austria: 'AT',
  belgium: 'BE',
  bulgaria: 'BG',
  croatia: 'HR',
  czechia: 'CZ',
  'czech republic': 'CZ',
  denmark: 'DK',
  estonia: 'EE',
  finland: 'FI',
  france: 'FR',
  georgia: 'GE',
  germany: 'DE',
  greece: 'GR',
  hungary: 'HU',
  iceland: 'IS',
  ireland: 'IE',
  italy: 'IT',
  japan: 'JP',
  latvia: 'LV',
  lithuania: 'LT',
  luxembourg: 'LU',
  netherlands: 'NL',
  'the netherlands': 'NL',
  norway: 'NO',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  serbia: 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  'south korea': 'KR',
  korea: 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  ukraine: 'UA',
  uk: 'UK',
  'united kingdom': 'UK',
  usa: 'US',
  'united states': 'US',
  canada: 'CA',
  australia: 'AU',
  israel: 'IL',
  turkey: 'TR',
  türkiye: 'TR',
  armenia: 'AM',
  moldova: 'MD',
  belarus: 'BY',
  russia: 'RU',
  kazakhstan: 'KZ',
  kyrgyzstan: 'KG',
  taiwan: 'TW',
  china: 'CN',
  india: 'IN',
  brazil: 'BR',
  mexico: 'MX',
  argentina: 'AR',
  'south africa': 'ZA',
}

/** ISO-ish two-letter code for a country name; anything already 2–3 upper-case letters passes through. */
export function countryCode(country: string): string {
  const c = country.trim()
  if (!c) return ''
  if (/^[A-Z]{2,3}$/.test(c)) return c
  return COUNTRY_CODES[c.toLowerCase()] ?? c
}

export interface DisplayName {
  /** Initial + surname for people with an affiliation; the full name otherwise. */
  short: string
  /** Country code, or '' when the name carries no country. */
  tag: string
  /** Everything after the "|", for tooltips and headings. */
  affiliation: string
}

/**
 * Short forms for a whole roster at once so that collisions can be resolved:
 * two "A. Nielsen"s fall back to their full names.
 */
export function displayNames(people: Participant[]): Map<Id, DisplayName> {
  const parsed = people.map((p) => ({ p, ...parseName(p.name) }))
  const shorts = parsed.map(({ org, country, person }) => (org || country ? initialSurname(person) : person))
  const seen = new Map<string, number>()
  for (const s of shorts) seen.set(s, (seen.get(s) ?? 0) + 1)
  const out = new Map<Id, DisplayName>()
  parsed.forEach(({ p, person, org, country }, i) => {
    const short = (seen.get(shorts[i]) ?? 0) > 1 ? person : shorts[i]
    const affiliation = [org, country].filter(Boolean).join(', ')
    out.set(p.id, { short, tag: countryCode(country), affiliation })
  })
  return out
}
