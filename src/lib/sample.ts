// A realistic sample day, modelled on the first pitching day of Baltic Sea Docs 2026
// (Riga, 10 September): the 13 projects pitched that day, the decision makers in the
// room, and nine 20-minute one-to-one slots in the afternoon.
//
// Names, countries and themes are from the public programme (dokforums.gov.lv). The
// interest scores are NOT real — nobody's actual preferences are public. They are
// authored by hand from what each kind of decision maker plausibly wants:
//   sales agents        cast a wide net, a few clear favourites
//   broadcasters        selective; national and neighbouring projects score high
//   festivals           a little interest in almost everything
//   funds / institutes  only projects with a national tie
// and, on the team side, from where each project's money is likely to come from.

import { pairKey, type Scores } from './scheduler'
import { emptyProject, parseRoster, withParticipants, withScores, withSlots, type Project } from './project'

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

// How keen each decision maker is to meet each team. One row per DM, one character
// per team in TEAMS order: '.' = no interest, 1 interested, 2 priority, 3 must-meet.
const DM_ROWS = [
  '1212132221212', // filmdelights — creative docs for cinema; Zviedris is a known name
  '11.112.212.11', // 3Box Media — TV-friendly stories
  '211..31222..1', // MDR — borders, Eastern Europe, Ukraine
  '.12..1.12.232', // DR Sales — Nordic projects, Finnish co-productions
  '22.22.11.121.', // Scottish Documentary Institute — emerging directors, personal films
  '12.222.3122.1', // Cat & Docs — auteur festival docs
  '1111.212211.2', // Rise and Shine — broad
  '1..1.1.313...', // Suspilne — the two Ukrainian projects above all
  '2112111212.11', // goEast — nearly everything from the region
  '1...3..2.1121', // EIDF / EBS — music, universal family stories
  '21.2.21212..1', // Taskovski — Eastern Europe and Caucasus
  '.....3..2....', // TV3 Latvia — Latvian projects only
  '1121121121111', // PÖFF — sees everything, Estonian ties a little more
  '....2..31..2.', // NHK — very selective; strong human stories
  '..3.....2....', // Estonian Film Institute — Estonian (co-)productions only
  '.11....21.223', // SVT — Swedish co-production, Nordic neighbours
  '21.21112.21.1', // Lightdox — auteur docs
]

// How keen each team is to meet each decision maker. One row per team, one character
// per DM in DMS order. Teams chase money first (broadcasters, sales), festivals second,
// funds only where they qualify.
const TEAM_ROWS = [
  '212.132.212.12.12', // 14,5 km — French co-pro, wants sales + German TV
  '2121123.1.2.11.22', // 35 Letters — sales-led
  '1.22.22.1.1.21231', // Borderline — Finnish/Estonian money: SVT, DR Sales, EFI
  '212.232.2.2.11.13', // Concrete Grassland — Cat & Docs and Lightdox above all
  '111.122.231.13..2', // Cords of Bliss — Asian broadcasters (EBS, NHK) matter most
  '3131.22.112212.12', // The Crust of Europe — Latvian TV, German TV, filmdelights
  '2.2.121.2.2.2..12', // Encounters/Departures — festival-minded
  '2131.321222.13.22', // Evening School — everyone; MDR, Cat & Docs, NHK top
  '2132.22.1.1211131', // Going Underground — MDR, SVT, TV3, EFI
  '112.1221212.11.12', // Keepers of the City — sales and goEast
  '2.13121.11..11.32', // Lunatics — Nordic broadcasters, then sales
  '1113.11..2..13.31', // Mariana’s Lament — DR Sales, SVT, NHK
  '2122122.111.11.31', // Master of Ceremonies — SVT (co-pro), sales
]

function parseRows(rows: string[], width: number, key: (row: number, col: number) => string): Scores {
  const scores: Scores = {}
  rows.forEach((row, r) => {
    if (row.length !== width) throw new Error(`sample row ${r} has ${row.length} cells, expected ${width}`)
    for (let c = 0; c < width; c++) {
      const ch = row[c]
      if (ch !== '.') scores[key(r, c)] = Number(ch)
    }
  })
  return scores
}

export function sampleProject(): Project {
  let p = withParticipants(emptyProject(), TEAMS, parseRoster(DMS.join('\n')))
  p = withSlots(p, SLOTS.length, SLOTS)
  const dmScores = parseRows(DM_ROWS, TEAMS.length, (d, t) => pairKey(p.teams[t].id, p.dms[d].id))
  const teamScores = parseRows(TEAM_ROWS, DMS.length, (t, d) => pairKey(p.teams[t].id, p.dms[d].id))
  return withScores(p, dmScores, teamScores)
}
