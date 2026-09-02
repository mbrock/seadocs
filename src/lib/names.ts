// Short forms of participant names for dense tables.
//
// Decision makers are entered as "First Last | Organisation, Country". In a
// board cell that becomes "J. Cornejo" with a small "ES" tag: initial, surname,
// country. Teams are project titles; for them we pick one salient word and set
// it in capitals — "The Crust of Europe" → EUROPE — the way a crew talks about
// the films it knows by heart.

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
  const words = nameWords(person)
  if (words.length < 2) return person
  return `${words[0][0]}. ${words[words.length - 1]}`
}

/** The last word of a name: "Cornejo". */
export function surname(person: string): string {
  const words = nameWords(person)
  return words.length ? words[words.length - 1] : person
}

/** Words of a name minus parenthesised nicknames: "Gunny (Gune) Hyoung" → Gunny, Hyoung. */
function nameWords(person: string): string[] {
  return person.split(/\s+/).filter((w) => w && !/^\(.*\)$/.test(w))
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

/** Words that never carry a title on their own. */
const TITLE_STOPWORDS = new Set(
  (
    'a an the and or of for from to in on at by with without into onto over under about after before ' +
    'our my your his her their its this that these those is are was were be been being am ' +
    'away here there where when how what who which not no yes all some any every each ' +
    'i you he she it we they me him us them ' +
    'le la les un une des du de et ou der die das ein eine und oder von zu für el los las y o en ' +
    'il lo gli i una di e o da per con su un'
  ).split(/\s+/),
)

/** Common nouns that are poor identifiers next to any other word: "Evening School" → EVENING, not SCHOOL. */
const TITLE_GENERIC = new Set(
  (
    'city town village country land world earth home house room school street road way place ' +
    'man woman men women boy girl child children people person family mother father brother sister son daughter ' +
    'life lives death story stories film movie documentary portrait diary journey history memory memories ' +
    'day days night nights year years time times summer winter spring autumn ' +
    'love war peace dream dreams song songs voice voices letter letters ' +
    'one two three first last new old little big small long short good bad ' +
    'part chapter act episode project untitled'
  ).split(/\s+/),
)

const capitalise = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w)

/**
 * One word that stands for a title, in title case. Takes the first alternative
 * of a slashed title, drops numbers, units, stopwords and possessives, then
 * the generic nouns if anything else remains, and returns the last word left —
 * English titles usually end on their head noun ("Cords of Bliss" → Bliss).
 * Returns '' when nothing usable remains; callers fall back to the title.
 */
export function titleWord(title: string): string {
  const firstAlternative = title.split(/\s*\/\s*/)[0]
  const words = firstAlternative
    .split(/[\s–—-]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 2 && !/\p{N}/u.test(w) && !/['’]s$/i.test(w) && !TITLE_STOPWORDS.has(w.toLowerCase()))
  const specific = words.filter((w) => !TITLE_GENERIC.has(w.toLowerCase()))
  const pool = specific.length ? specific : words
  return pool.length ? capitalise(pool[pool.length - 1]) : ''
}

/**
 * Title words for a whole set, made unique: when two titles land on the same
 * word, each gets a second word prefixed ("Crust Europe") or, failing that,
 * the full title.
 */
export function titleWords(titles: string[]): string[] {
  const codes = titles.map((t) => titleWord(t) || t)
  const counts = new Map<string, number>()
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1)
  return codes.map((code, i) => {
    if ((counts.get(code) ?? 0) < 2) return code
    const words = titles[i]
      .split(/[\s/–—-]+/)
      .map((w) => capitalise(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')))
      .filter((w) => w.length > 2 && w !== code && !TITLE_STOPWORDS.has(w.toLowerCase()))
    return words.length ? `${words[0]} ${code}` : titles[i]
  })
}

export interface DisplayName {
  /** Initial + surname for people with an affiliation; the full name otherwise. */
  short: string
  /** The densest form: a title word for teams ("Europe"), the bare surname for people ("Cornejo") when it is unique. */
  code: string
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
  // Titles (names without affiliation) get title words, made unique among themselves.
  const titled = parsed.filter(({ org, country }) => !org && !country)
  const codes = new Map(titled.map(({ p }, i) => [p.id, titleWords(titled.map((t) => t.person))[i]]))
  const surnames = parsed.map(({ person }) => surname(person))
  const surnameSeen = new Map<string, number>()
  for (const s of surnames) surnameSeen.set(s, (surnameSeen.get(s) ?? 0) + 1)
  const out = new Map<Id, DisplayName>()
  parsed.forEach(({ p, person, org, country }, i) => {
    const short = (seen.get(shorts[i]) ?? 0) > 1 ? person : shorts[i]
    const affiliation = [org, country].filter(Boolean).join(', ')
    const personCode = (surnameSeen.get(surnames[i]) ?? 0) > 1 ? short : surnames[i]
    out.set(p.id, { short, code: p.code ?? codes.get(p.id) ?? personCode, tag: countryCode(country), affiliation })
  })
  return out
}
