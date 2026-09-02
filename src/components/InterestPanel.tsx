import { useState, type Dispatch, type SetStateAction } from 'react'
import { MAX_SCORE, SCORE_LABELS, scoreOf, type Id, type Participant } from '../lib/scheduler'
import { randomScores } from '../lib/fixtures'
import { cycleScore, withScore, withScores, type Project, type ScoreKind } from '../lib/project'
import { Button, Empty, Name, OnlineMark, Panel, PanelHeader, Segmented, scoreTint, inputClass } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

type Layout = 'grid' | 'list'

const MODES: { value: ScoreKind; label: string; title: string }[] = [
  { value: 'dm', label: 'Decision makers ask', title: 'How keen each decision maker is to meet each team. Drives the schedule.' },
  { value: 'team', label: 'Teams ask', title: 'How keen each team is to meet each decision maker. Breaks ties and adds requests.' },
]

/**
 * Two grids with the same shape, edited one at a time. The grid layout needs
 * width; the list layout edits one person's row at a time and is what small
 * screens get.
 */
export function InterestPanel({ project, onChange }: Props) {
  const [mode, setMode] = useState<ScoreKind>('dm')
  const [layout, setLayout] = useState<Layout>('grid')
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const asked = Object.keys(mode === 'dm' ? project.dmScores : project.teamScores).length

  return (
    <Panel>
      <PanelHeader title={`Interest · ${asked} of ${project.teams.length * project.dms.length} cells`}>
        <Segmented label="Whose interest" value={mode} options={MODES} onChange={setMode} />
        <div className="hidden md:block">
          <Segmented
            label="Layout"
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'One at a time' },
            ]}
          />
        </div>
        <ScoreKey kind={mode} />
        <Button variant="quiet" disabled={!hasPeople} onClick={() => onChange(randomScores(project))} title="Fill both grids with random interest">
          randomise
        </Button>
        <Button
          variant="quiet"
          disabled={!hasPeople}
          onClick={() => {
            if (confirm('Clear both interest grids?')) onChange(withScores(project, {}, {}))
          }}
        >
          clear
        </Button>
      </PanelHeader>
      {!hasPeople ? (
        <Empty>Add teams and decision makers under People first.</Empty>
      ) : (
        <>
          <div className={layout === 'grid' ? 'hidden md:block' : 'hidden'}>
            <Grid project={project} mode={mode} onCycle={(team, dm) => onChange((p) => cycleScore(p, mode, team, dm))} />
          </div>
          <div className={layout === 'grid' ? 'md:hidden' : ''}>
            <RowEditor project={project} mode={mode} onSet={(team, dm, s) => onChange((p) => withScore(p, mode, team, dm, s))} />
          </div>
        </>
      )}
    </Panel>
  )
}

function ScoreKey({ kind }: { kind: ScoreKind }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[0.7rem] text-muted">
      {SCORE_LABELS.map((label, s) => (
        <span key={s} className="inline-flex items-center gap-1" title={label}>
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-[2px] border border-rule text-[0.65rem] ${scoreTint[kind][s]}`}>
            {s || ''}
          </span>
          <span className="hidden lg:inline">{label}</span>
        </span>
      ))}
    </div>
  )
}

/** Rows = decision makers, columns = teams, in both modes; the mode decides whose score the digit is. */
function Grid({ project, mode, onCycle }: { project: Project; mode: ScoreKind; onCycle: (team: Id, dm: Id) => void }) {
  const scores = mode === 'dm' ? project.dmScores : project.teamScores
  const otherScores = mode === 'dm' ? project.teamScores : project.dmScores
  const otherDot = mode === 'dm' ? 'bg-sea-3' : 'bg-rose-3'
  return (
    <div className="max-h-[75vh] overflow-auto">
      <table className="border-separate border-spacing-0 text-[0.8rem]">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 border-r border-b border-rule bg-paper" />
            {project.teams.map((t) => (
              <th key={t.id} className="sticky top-0 z-20 h-[9.5rem] border-b border-rule bg-paper px-0 align-bottom font-normal">
                <div className="vertical-text mx-auto max-h-[9rem] overflow-hidden pb-1 text-left text-[0.75rem] leading-none text-ellipsis whitespace-nowrap" title={t.name}>
                  {t.name}
                  <OnlineMark show={t.online} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.dms.map((d) => (
            <tr key={d.id} className="group">
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[14rem] border-r border-b border-rule bg-paper px-2 py-0 text-left text-[0.78rem] font-normal whitespace-nowrap group-hover:bg-canvas"
                title={d.name}
              >
                <Name person={d} className="flex max-w-[14rem]" />
              </th>
              {project.teams.map((t) => {
                const s = scoreOf(scores, t.id, d.id)
                const other = scoreOf(otherScores, t.id, d.id)
                return (
                  <td key={t.id} className="border-r border-b border-rule/70 p-0">
                    <button
                      type="button"
                      title={`${d.name} × ${t.name}: ${SCORE_LABELS[s]}${other ? ` (other side: ${SCORE_LABELS[other]})` : ''}`}
                      onClick={() => onCycle(t.id, d.id)}
                      className={`relative block h-7 w-7 cursor-pointer font-mono text-[0.8rem] font-semibold hover:outline hover:outline-ink ${scoreTint[mode][s] || 'text-faint'}`}
                    >
                      {s || ''}
                      {other > 0 && <span aria-hidden className={`absolute right-0.5 bottom-0.5 h-1 w-1 rounded-full ${otherDot}`} />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pick one person on the asking side; rate everyone on the other side. */
function RowEditor({ project, mode, onSet }: { project: Project; mode: ScoreKind; onSet: (team: Id, dm: Id, score: number) => void }) {
  const askers: Participant[] = mode === 'dm' ? project.dms : project.teams
  const targets: Participant[] = mode === 'dm' ? project.teams : project.dms
  const [pickedId, setPicked] = useState<Id | null>(null)
  const asker = askers.find((a) => a.id === pickedId) ?? askers[0]
  const scores = mode === 'dm' ? project.dmScores : project.teamScores
  const otherScores = mode === 'dm' ? project.teamScores : project.dmScores
  const pair = (target: Participant): [Id, Id] => (mode === 'dm' ? [target.id, asker.id] : [asker.id, target.id])
  const index = askers.indexOf(asker)
  const step = (delta: number) => setPicked(askers[(index + delta + askers.length) % askers.length].id)

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <Button onClick={() => step(-1)} aria-label="Previous" className="px-2">
          ‹
        </Button>
        <select aria-label={mode === 'dm' ? 'Decision maker' : 'Team'} className={`${inputClass} min-w-0 flex-1 font-sans`} value={asker.id} onChange={(e) => setPicked(e.target.value)}>
          {askers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button onClick={() => step(1)} aria-label="Next" className="px-2">
          ›
        </Button>
      </div>
      <p className="mt-2 mb-3 text-[0.8rem] text-muted">
        {index + 1} of {askers.length} · how keen {mode === 'dm' ? 'this decision maker' : 'this team'} is to meet each of these
      </p>
      <ul className="divide-y divide-rule border-y border-rule">
        {targets.map((t) => {
          const [team, dm] = pair(t)
          const s = scoreOf(scores, team, dm)
          const other = scoreOf(otherScores, team, dm)
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[0.9rem]" title={t.name}>
                {t.name}
                <OnlineMark show={t.online} />
                {other > 0 && <span className="ml-2 font-mono text-[0.7rem] text-muted">they: {other}</span>}
              </span>
              <div role="radiogroup" aria-label={`${asker.name} → ${t.name}`} className="inline-flex shrink-0 rounded-[3px] border border-rule">
                {Array.from({ length: MAX_SCORE + 1 }, (_, v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={s === v}
                    title={SCORE_LABELS[v]}
                    onClick={() => onSet(team, dm, v)}
                    className={`h-8 w-9 cursor-pointer font-mono text-[0.85rem] font-semibold first:rounded-l-[2px] last:rounded-r-[2px] ${
                      s === v ? scoreTint[mode][v] || 'bg-ink text-paper' : 'text-faint hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    {v || '–'}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
