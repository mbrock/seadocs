import { useState, type Dispatch, type SetStateAction } from 'react'
import { SCORE_LABELS, scoreOf } from '../lib/scheduler'
import { randomScores } from '../lib/fixtures'
import { cycleScore, withScores, type Project, type ScoreKind } from '../lib/project'
import { Button, Card, CardTitle, Hint, TabButton } from './ui'
import { scoreClass } from './styles'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

const hints: Record<ScoreKind, React.ReactNode> = {
  dm: (
    <>
      Rows = decision makers, columns = teams. Click a cell to record how keen <em>that decision maker</em> is to meet{' '}
      <em>that team</em>.
    </>
  ),
  team: (
    <>
      Rows = decision makers, columns = teams. Click a cell to record how keen <em>that team</em> is to meet{' '}
      <em>that decision maker</em>. Used to break ties, and to request meetings the decision maker did not ask for.
    </>
  ),
}

export function InterestPanel({ project, onChange }: Props) {
  const [mode, setMode] = useState<ScoreKind>('dm')
  const hasPeople = project.teams.length > 0 && project.dms.length > 0

  return (
    <Card>
      <CardTitle>Interest grids</CardTitle>
      <Hint>
        Two grids, same layout. <strong>Decision-maker interest is the primary driver</strong> of the schedule: those meetings are
        placed first, strongest interest first. Team interest only breaks ties between meetings a decision maker rated equally, and
        lets a team request a meeting the decision maker didn't ask for (those are placed last).
      </Hint>
      <div className="flex flex-wrap gap-0.5">
        <TabButton active={mode === 'dm'} onClick={() => setMode('dm')}>
          Decision-maker interest (primary)
        </TabButton>
        <TabButton active={mode === 'team'} onClick={() => setMode('team')}>
          Team interest (tie-breaker)
        </TabButton>
      </div>
      <Hint className="mt-3">{hints[mode]}</Hint>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ScoreKey />
        <div>
          <Button disabled={!hasPeople} onClick={() => onChange(randomScores(project))}>
            Randomise both (for testing)
          </Button>
          <Button
            variant="danger"
            disabled={!hasPeople}
            onClick={() => {
              if (confirm('Clear both interest grids?')) onChange(withScores(project, {}, {}))
            }}
          >
            Clear both
          </Button>
        </div>
      </div>
      <div className="mt-3.5 max-h-[520px] overflow-auto border border-line">
        {hasPeople ? (
          <Matrix project={project} mode={mode} onCycle={(team, dm) => onChange((p) => cycleScore(p, mode, team, dm))} />
        ) : (
          <Hint className="m-3">Add participants in Setup first.</Hint>
        )}
      </div>
    </Card>
  )
}

function ScoreKey() {
  return (
    <div className="mt-2 flex gap-3.5 font-mono text-[10px] text-muted">
      {SCORE_LABELS.map((label, s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={`inline-block h-3 w-3 border border-line ${scoreClass[s]}`} />
          {s} {label}
        </span>
      ))}
    </div>
  )
}

function Matrix({ project, mode, onCycle }: { project: Project; mode: ScoreKind; onCycle: (team: string, dm: string) => void }) {
  const scores = mode === 'dm' ? project.dmScores : project.teamScores
  return (
    <table className="border-collapse text-[12px]">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-30 border border-line bg-ink px-1 py-1.5 font-mono text-[10px] tracking-[0.5px] text-paper">
            DM \ Team
          </th>
          {project.teams.map((t) => (
            <th
              key={t.id}
              title={t.name}
              className="sticky top-0 z-20 max-w-[70px] overflow-hidden border border-line bg-paper-dim px-1 py-1.5 font-mono text-[10px] tracking-[0.5px] text-ellipsis"
            >
              {t.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {project.dms.map((d) => (
          <tr key={d.id}>
            <td className="sticky left-0 z-10 border border-line bg-paper-dim px-2 py-1 text-left font-mono text-[11px] whitespace-nowrap">
              {d.name}
            </td>
            {project.teams.map((t) => {
              const s = scoreOf(scores, t.id, d.id)
              return (
                <td
                  key={t.id}
                  role="button"
                  title={`${d.name} × ${t.name}: ${SCORE_LABELS[s]}`}
                  onClick={() => onCycle(t.id, d.id)}
                  className={`h-[26px] w-[30px] cursor-pointer border border-line text-center font-bold select-none ${scoreClass[s]}`}
                >
                  {s || ''}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
