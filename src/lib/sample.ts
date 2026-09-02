// A realistic sample day, modelled on the first pitching day of Baltic Sea Docs 2026
// (Riga, 10 September): the 13 projects pitched that day, the decision makers in the
// room, and nine 20-minute one-to-one slots in the afternoon.
//
// Names, countries and themes are from the public programme (dokforums.gov.lv). The
// asks are NOT real — nobody's actual preferences are public. They are authored by
// hand from what each kind of decision maker plausibly wants:
//   sales agents        cast a wide net
//   broadcasters        selective; national and neighbouring projects
//   festivals           a bit of almost everything
//   funds / institutes  only projects with a national tie
// and, on the team side, from where each project's money is likely to come from.

import { pairKey, type Asks } from './scheduler'
import { emptyProject, parseRoster, withParticipants, withAsks, withSlots, withTitle, type Project } from './project'

/** Column order for the decision-maker rows below (the pitching order that day). */
const TEAMS = [
  '14,5 km Away From Our Dreams', // Armenia, France — Armenian-Turkish border village
  '35 Letters', //                    Poland — letters to a modelling agency, 30 years on
  'Borderline', //                    Estonia, Finland — Finnish–Estonian borderlands
  'Concrete Grassland', //            Georgia, France — Tbilisi apartment never built
  'Cords of Bliss', //                Kyrgyzstan — kyl-kyyak master and his sister
  'The Crust of Europe', //           Latvia — fortified eastern EU border landscape
  'Encounters/Departures', //         Lithuania, Poland — filmmaker's grandfather's legacy
  'Evening School', //                Ukraine — adult music school in wartime Kyiv
  'Going Underground', //             Latvia, Estonia, Finland — civil defence architect
  'Keepers of the City', //           Ukraine, Czechia — Kharkiv community radio
  'Lunatics', //                      Finland — humanity and the Moon
  'Mariana’s Lament', //              Finland — Finnish lament singing as therapy
  'Master of Ceremonies', //          Poland, Sweden — teacher conducting secular funerals
]

/** Row order for the team rows below. Country tells you where the money lives. */
const DMS = [
  'Christa Auderlitzky | filmdelights, Austria', //                              sales & distribution
  'José Lorenzo Benitez Cornejo | 3Box Media, Spain', //                         sales
  'Thomas Beyer | MDR, Germany', //                                              broadcaster (east Germany)
  'Astrid Bjerregaard Nielsen | DR Sales, Denmark', //                           broadcaster sales arm
  'Flore Cosquer | Scottish Documentary Institute, UK', //                       institute / development
  'Aleksandra Derewienko | Cat & Docs, France', //                               sales (auteur docs)
  'Anja Dziersk | Rise and Shine, Germany', //                                   sales
  'Kateryna Feleniuk | Suspilne Ukraine, Ukraine', //                            broadcaster
  'Rebecca Heiler | goEast, Germany', //                                         festival (Central/Eastern Europe)
  'Gunny (Gune) Hyoung | EIDF – Korea EBS International Documentary Festival, South Korea *', // broadcaster + festival, online
  'Azra Jašarević | Taskovski, UK', //                                           sales (Eastern Europe)
  'Elīna Jēkabsone | TV3, Latvia', //                                            broadcaster (commercial)
  'Marianna Kaat | PÖFF, Estonia', //                                            festival
  'Natsu Kawakami | NHK, Japan *', //                                            broadcaster, online
  'Filipp Kruusvall | Estonian Film Institute, Estonia', //                      fund
  'Charlotte Gry Madsen | SVT, Sweden', //                                       broadcaster
  'Nevena Milašinović | Lightdox, Switzerland', //                               sales
]

const SLOTS = ['15:20', '15:40', '16:00', '16:20', '16:40', '17:00', '17:20', '17:40', '18:00']

// Which teams each decision maker asked to meet. One row per DM, one character per
// team in TEAMS order: 'x' = asked, '.' = not. 116 asks for 117 seats, but Evening
// School is wanted by 14 decision makers and has 9 slots, so not everything fits.
const DM_ROWS = [
  'xx.x.xxxx.x.x', // filmdelights — creative docs for cinema; Zviedris is a known name
  'x..x.x.xxx..x', // 3Box Media — TV-friendly stories
  'xxx..xxxxx...', // MDR — borders, Eastern Europe, Ukraine
  '.xx....xx.xxx', // DR Sales — Nordic projects, Finnish co-productions
  'xx.xx.xx.xx..', // Scottish Documentary Institute — emerging directors, personal films
  'xx.xxx.x.xx.x', // Cat & Docs — auteur festival docs
  'x.x..xxxx.x.x', // Rise and Shine — broad
  'x..x.x.xxx...', // Suspilne — the two Ukrainian projects above all
  'xxxxx.xx.x.x.', // goEast — nearly everything from the region
  'x...x..x.xxx.', // EIDF / EBS — music, universal family stories
  'xx.x.xxxxx...', // Taskovski — Eastern Europe and Caucasus
  '.....x..x....', // TV3 Latvia — Latvian projects only
  'xxxx.xx.xx.x.', // PÖFF — sees nearly everything, Estonian ties first
  '....x..xx..x.', // NHK — very selective; strong human stories
  '..x.....x....', // Estonian Film Institute — Estonian (co-)productions only
  '.x.....xx.xxx', // SVT — Swedish co-production, Nordic neighbours
  'xx.xxx.x.xx..', // Lightdox — auteur docs
]

// Which decision makers each team asked to meet. One row per team, one character per
// DM in DMS order. Teams chase money first (broadcasters, sales), festivals second,
// funds only where they qualify.
const TEAM_ROWS = [
  'xxx..xx.x.x..x..x', // 14,5 km — French co-pro, wants sales + German TV
  'xxx.xxx...x.x..xx', // 35 Letters — sales-led
  'x.xx.xx.....x.xx.', // Borderline — Finnish/Estonian money: SVT, DR Sales, EFI
  'xxx.xxx.x.x.....x', // Concrete Grassland — Cat & Docs and Lightdox above all
  'x.x..xx.xx...x..x', // Cords of Bliss — Asian broadcasters (EBS, NHK) matter most
  'xxx..xx.x.xx.x..x', // The Crust of Europe — Latvian TV, German TV, filmdelights
  'x.x..x..x.x.x...x', // Encounters/Departures — festival-minded
  'xxx..xx.xxx..x.xx', // Evening School — nearly everyone
  'xxxx.xx...xx.x.x.', // Going Underground — MDR, SVT, TV3, EFI
  'x.x.xxx.x.x.....x', // Keepers of the City — sales and goEast
  'x.xx.xx..x.....xx', // Lunatics — Nordic broadcasters, then sales
  'x.xx..x..x...x.x.', // Mariana’s Lament — DR Sales, SVT, NHK
  'xxxx.xx.x.x....x.', // Master of Ceremonies — SVT (co-pro), sales
]

function parseRows(rows: string[], width: number, key: (row: number, col: number) => string): Asks {
  const asks: Asks = {}
  rows.forEach((row, r) => {
    if (row.length !== width) throw new Error(`sample row ${r} has ${row.length} cells, expected ${width}`)
    for (let c = 0; c < width; c++) if (row[c] === 'x') asks[key(r, c)] = true
  })
  return asks
}

export function sampleProject(): Project {
  let p = withParticipants(withTitle(emptyProject(), 'Baltic Sea Docs 2026 · One-to-one meetings, day 1 · Thursday 10 September'), TEAMS, parseRoster(DMS.join('\n')))
  p = withSlots(p, SLOTS)
  const dmAsks = parseRows(DM_ROWS, TEAMS.length, (d, t) => pairKey(p.teams[t].id, p.dms[d].id))
  const teamAsks = parseRows(TEAM_ROWS, DMS.length, (t, d) => pairKey(p.teams[t].id, p.dms[d].id))
  return withAsks(p, dmAsks, teamAsks)
}
