import { useState, type Dispatch, type SetStateAction } from 'react'
import { MAX_SCORE, SCORE_LABELS, scoreOf, type Id, type Participant, type Scores } from '../lib/scheduler'
import { interestCsv, download } from '../lib/csv'
import { parseInterestGrid, type GridImport } from '../lib/import'
import { cycleScore, withScore, withScores, type Project, type ScoreKind } from '../lib/project'
import { Button, Chooser, Empty, Name, OnlineMark, Panel, PanelHeader, Segmented, scoreTint, textareaClass } from './ui'
import { useNames } from './useNames'
import { parseName, type DisplayName } from '../lib/names'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

type Layout = 'list' | 'grid'

const MODES: { value: ScoreKind; label: string; title: string }[] = [
  { value: 'dm', label: 'Decision makers ask', title: 'How keen each decision maker is to meet each team. Drives the schedule.' },
  { value: 'team', label: 'Teams ask', title: 'How keen each team is to meet each decision maker. Breaks ties and adds requests.' },
]

/**
 * Two score tables with the same shape, edited one side at a time. The default
 * layout edits one person's asks at a time; the overview grid shows everything
 * but needs a wide screen.
 */
export function InterestPanel({ project, onChange }: Props) {
  const [mode, setMode] = useState<ScoreKind>('dm')
  const [layout, setLayout] = useState<Layout>('list')
  const [pasting, setPasting] = useState(false)
  const names = useNames(project)
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const asked = Object.keys(mode === 'dm' ? project.dmScores : project.teamScores).length
  const kindLabel = mode === 'dm' ? 'decision makers' : 'teams'

  return (
    <Panel>
      <PanelHeader title={`Interest · ${asked} ${asked === 1 ? 'ask' : 'asks'} from ${kindLabel}`}>
        <Segmented label="Whose interest" value={mode} options={MODES} onChange={setMode} />
        <div className="hidden md:block">
          <Segmented
            label="Layout"
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'list', label: 'One at a time' },
              { value: 'grid', label: 'Overview' },
            ]}
          />
        </div>
        <ScoreKey kind={mode} />
        <Button disabled={!hasPeople} onClick={() => setPasting((v) => !v)} aria-expanded={pasting} title="Paste a grid copied from a spreadsheet">
          Paste
        </Button>
        <Button disabled={!hasPeople} onClick={() => download(`interest-${mode}.csv`, interestCsv(project, mode), 'text/csv')} title="Download this grid as a spreadsheet">
          CSV
        </Button>
        <Button
          variant="quiet"
          disabled={!hasPeople}
          onClick={() => {
            if (confirm(`Clear what ${kindLabel} asked?`)) onChange(mode === 'dm' ? withScores(project, {}, project.teamScores) : withScores(project, project.dmScores, {}))
          }}
        >
          clear
        </Button>
      </PanelHeader>
      {!hasPeople ? (
        <Empty>Add teams and decision makers under People first.</Empty>
      ) : (
        <>
          {pasting && (
            <PasteGrid
              project={project}
              mode={mode}
              onApply={(scores) => {
                onChange((p) => (mode === 'dm' ? withScores(p, scores, p.teamScores) : withScores(p, p.dmScores, scores)))
                setPasting(false)
              }}
              onClose={() => setPasting(false)}
            />
          )}
          <div className={layout === 'grid' ? 'hidden md:block' : 'hidden'}>
            <Grid project={project} mode={mode} onCycle={(team, dm) => onChange((p) => cycleScore(p, mode, team, dm))} />
          </div>
          <div className={layout === 'grid' ? 'md:hidden' : ''}>
            <RowEditor project={project} names={names} mode={mode} onSet={(team, dm, s) => onChange((p) => withScore(p, mode, team, dm, s))} />
          </div>
        </>
      )}
    </Panel>
  )
}

/**
 * Import a grid from the clipboard: names down one side and across the top,
 * 0–3 in the cells. Replaces this side's asks once the organiser has seen
 * what matched.
 */
function PasteGrid({ project, mode, onApply, onClose }: { project: Project; mode: ScoreKind; onApply: (scores: Scores) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const parsed: GridImport | null = text.trim() ? parseInterestGrid(text, project.teams, project.dms) : null
  const who = mode === 'dm' ? 'decision makers' : 'teams'
  return (
    <div className="grid gap-2 border-b border-rule bg-canvas px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
      <textarea
        aria-label="Pasted interest grid"
        className={`${textareaClass} min-h-[8rem] font-mono text-[0.75rem]`}
        placeholder={'Copy the sheet and paste it here.\nNames across the top and down the side, 0–3 (or x) in the cells.'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="flex flex-col gap-2 text-[0.8rem]">
        <p className="text-muted">Replaces what {who} asked. Names match loosely: full name, surname form, or the board code.</p>
        {parsed ? (
          <ul className="text-[0.8rem]">
            <li>
              {parsed.matchedDms}/{project.dms.length} decision makers · {parsed.matchedTeams}/{project.teams.length} teams · {Object.keys(parsed.scores).length} asks
            </li>
            {parsed.unmatched.length > 0 && (
              <li className="text-warn" title={parsed.unmatched.join(', ')}>
                not recognised: {parsed.unmatched.slice(0, 4).join(', ')}
                {parsed.unmatched.length > 4 && ` +${parsed.unmatched.length - 4}`}
              </li>
            )}
            {parsed.unreadable > 0 && <li className="text-warn">{parsed.unreadable} cells were not 0–3</li>}
          </ul>
        ) : (
          text.trim() && <p className="text-warn">No names recognised in the first row or column.</p>
        )}
        <div className="mt-auto flex gap-2">
          <Button variant="primary" disabled={!parsed} onClick={() => parsed && onApply(parsed.scores)}>
            Apply
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function ScoreKey({ kind }: { kind: ScoreKind }) {
  return (
    <div className="flex items-center gap-2 text-[0.7rem] text-muted">
      {SCORE_LABELS.map((label, s) => (
        <span key={s} className="inline-flex items-center gap-1" title={s ? label : 'not asked'}>
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-[2px] border border-rule text-[0.65rem] ${scoreTint[kind][s]}`}>
            {s || ''}
          </span>
          <span className="hidden lg:inline">{s ? label : 'not asked'}</span>
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
                      className={`relative block h-7 w-7 cursor-pointer text-[0.8rem] font-semibold tabular-nums hover:outline hover:outline-ink ${scoreTint[mode][s] || 'text-faint'}`}
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
function RowEditor({
  project,
  names,
  mode,
  onSet,
}: {
  project: Project
  names: Map<Id, DisplayName>
  mode: ScoreKind
  onSet: (team: Id, dm: Id, score: number) => void
}) {
  const askers: Participant[] = mode === 'dm' ? project.dms : project.teams
  const targets: Participant[] = mode === 'dm' ? project.teams : project.dms
  const [pickedId, setPicked] = useState<Id | null>(null)
  const asker = askers.find((a) => a.id === pickedId) ?? askers[0]
  const scores = mode === 'dm' ? project.dmScores : project.teamScores
  const otherScores = mode === 'dm' ? project.teamScores : project.dmScores
  const pair = (asking: Id, target: Id): [Id, Id] => (mode === 'dm' ? [target, asking] : [asking, target])
  const asksOf = (a: Participant) => targets.filter((t) => scoreOf(scores, ...pair(a.id, t.id)) > 0).length
  const index = askers.indexOf(asker)
  const step = (delta: number) => setPicked(askers[(index + delta + askers.length) % askers.length].id)
  const display = names.get(asker.id)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start lg:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)]">
      <div className="border-b border-rule lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-auto lg:border-r lg:border-b-0">
        <Chooser
          label={mode === 'dm' ? 'Decision maker' : 'Team'}
          groups={[{ title: mode === 'dm' ? 'Decision makers' : 'Teams', people: askers }]}
          current={asker.id}
          onPick={setPicked}
          names={names}
          meta={(a) => `${asksOf(a)}/${targets.length}`}
        />
      </div>
      <div className="px-3 py-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">
              {mode === 'dm' ? 'Decision maker' : 'Team'} · {index + 1} of {askers.length}
            </div>
            <div className="text-[1.05rem] leading-tight font-bold">
              {parseName(asker.name).person}
              <OnlineMark show={asker.online} />
            </div>
            {display?.affiliation && <div className="text-[0.8rem] text-muted">{display.affiliation}</div>}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button onClick={() => step(-1)} aria-label="Previous" className="px-2">
              ‹
            </Button>
            <Button onClick={() => step(1)} aria-label="Next" className="px-2">
              ›
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-rule border-y border-rule">
          {targets.map((t) => {
            const [team, dm] = pair(asker.id, t.id)
            const s = scoreOf(scores, team, dm)
            const other = scoreOf(otherScores, team, dm)
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[0.9rem]">
                  <Name person={t} display={names.get(t.id)} className="flex" />
                  {other > 0 && (
                    <span className={`shrink-0 rounded-[2px] px-1 text-[0.68rem] font-semibold ${scoreTint[mode === 'dm' ? 'team' : 'dm'][other]}`} title={`They asked: ${SCORE_LABELS[other]}`}>
                      they {other}
                    </span>
                  )}
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
                      className={`h-8 w-9 cursor-pointer text-[0.85rem] font-semibold tabular-nums first:rounded-l-[2px] last:rounded-r-[2px] ${
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
    </div>
  )
}
