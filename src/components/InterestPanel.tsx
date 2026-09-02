import { useState, type Dispatch, type SetStateAction } from 'react'
import { asked, type Asks, type Id, type Participant } from '../lib/scheduler'
import { interestCsv, download } from '../lib/csv'
import { parseInterestGrid, type GridImport } from '../lib/import'
import { toggleAsk, withAsk, withAsks, type AskKind, type Project } from '../lib/project'
import { Button, Chooser, Empty, KeyItem, Name, OnlineMark, Panel, PanelHeader, Segmented, Swatch, askTint, textareaClass } from './ui'
import { useNames } from './useNames'
import { parseName, type DisplayName } from '../lib/names'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

type Layout = 'list' | 'grid'

const MODES: { value: AskKind; label: string; title: string }[] = [
  { value: 'dm', label: 'Decision makers ask', title: 'Which teams each decision maker wants to meet. Drives the schedule.' },
  { value: 'team', label: 'Teams ask', title: 'Which decision makers each team wants to meet. Heard once the decision makers are served.' },
]

/**
 * Two ask tables with the same shape, edited one side at a time: a cell is
 * either asked or not. The default layout edits one person's asks at a time;
 * the overview grid shows everything but needs a wide screen.
 */
export function InterestPanel({ project, onChange }: Props) {
  const [mode, setMode] = useState<AskKind>('dm')
  const [layout, setLayout] = useState<Layout>('list')
  const [pasting, setPasting] = useState(false)
  const names = useNames(project)
  const hasPeople = project.teams.length > 0 && project.dms.length > 0
  const count = Object.keys(mode === 'dm' ? project.dmAsks : project.teamAsks).length
  const kindLabel = mode === 'dm' ? 'decision makers' : 'teams'

  return (
    <Panel>
      <PanelHeader title={`Interest · ${count} ${count === 1 ? 'ask' : 'asks'} from ${kindLabel}`}>
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
        <AskKey kind={mode} />
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
            if (confirm(`Clear what ${kindLabel} asked?`)) onChange(mode === 'dm' ? withAsks(project, {}, project.teamAsks) : withAsks(project, project.dmAsks, {}))
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
              onApply={(asks) => {
                onChange((p) => (mode === 'dm' ? withAsks(p, asks, p.teamAsks) : withAsks(p, p.dmAsks, asks)))
                setPasting(false)
              }}
              onClose={() => setPasting(false)}
            />
          )}
          <div className={layout === 'grid' ? 'hidden md:block' : 'hidden'}>
            <Grid project={project} mode={mode} onToggle={(team, dm) => onChange((p) => toggleAsk(p, mode, team, dm))} />
          </div>
          <div className={layout === 'grid' ? 'md:hidden' : ''}>
            <RowEditor project={project} names={names} mode={mode} onSet={(team, dm, wants) => onChange((p) => withAsk(p, mode, team, dm, wants))} />
          </div>
        </>
      )}
    </Panel>
  )
}

/**
 * Import a grid from the clipboard: names down one side and across the top,
 * a mark (x, 1, yes) in the cells that are asked. Replaces this side's asks
 * once the organiser has seen what matched.
 */
function PasteGrid({ project, mode, onApply, onClose }: { project: Project; mode: AskKind; onApply: (asks: Asks) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const parsed: GridImport | null = text.trim() ? parseInterestGrid(text, project.teams, project.dms) : null
  const who = mode === 'dm' ? 'decision makers' : 'teams'
  return (
    <div className="grid gap-2 border-b border-rule bg-canvas px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
      <textarea
        aria-label="Pasted interest grid"
        className={`${textareaClass} min-h-[8rem] font-mono text-[0.75rem]`}
        placeholder={'Copy the sheet and paste it here.\nNames across the top and down the side, x (or 1, yes) where someone asked.'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="flex flex-col gap-2 text-[0.8rem]">
        <p className="text-muted">Replaces what {who} asked. Names match loosely: full name, surname form, or the board code.</p>
        {parsed ? (
          <ul className="text-[0.8rem]">
            <li>
              {parsed.matchedDms}/{project.dms.length} decision makers · {parsed.matchedTeams}/{project.teams.length} teams · {Object.keys(parsed.asks).length} asks
            </li>
            {parsed.unmatched.length > 0 && (
              <li className="text-warn" title={parsed.unmatched.join(', ')}>
                not recognised: {parsed.unmatched.slice(0, 4).join(', ')}
                {parsed.unmatched.length > 4 && ` +${parsed.unmatched.length - 4}`}
              </li>
            )}
            {parsed.unreadable > 0 && <li className="text-warn">{parsed.unreadable} cells were not x, yes, 1 or blank</li>}
          </ul>
        ) : (
          text.trim() && <p className="text-warn">No names recognised in the first row or column.</p>
        )}
        <div className="mt-auto flex gap-2">
          <Button variant="primary" disabled={!parsed} onClick={() => parsed && onApply(parsed.asks)}>
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

function AskKey({ kind }: { kind: AskKind }) {
  const other = kind === 'dm' ? 'team' : 'DM'
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <KeyItem swatch={<Swatch className={askTint[kind]} />}>asked</KeyItem>
      <KeyItem swatch={<Swatch className="bg-paper" />}>not asked</KeyItem>
      <KeyItem swatch={<OtherDot kind={kind} />}>{other} asked too</KeyItem>
    </div>
  )
}

/** Small dot in the other side's colour: they asked for this pair as well. */
function OtherDot({ kind, className = '' }: { kind: AskKind; className?: string }) {
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${kind === 'dm' ? 'bg-sea-3' : 'bg-gold-3'} ${className}`} />
}

/** Rows = decision makers, columns = teams, in both modes; the mode decides whose ask the mark is. */
function Grid({ project, mode, onToggle }: { project: Project; mode: AskKind; onToggle: (team: Id, dm: Id) => void }) {
  const asks = mode === 'dm' ? project.dmAsks : project.teamAsks
  const otherAsks = mode === 'dm' ? project.teamAsks : project.dmAsks
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
                const on = asked(asks, t.id, d.id)
                const other = asked(otherAsks, t.id, d.id)
                return (
                  <td key={t.id} className="border-r border-b border-rule/70 p-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${d.name} × ${t.name}`}
                      title={`${d.name} × ${t.name}: ${on ? 'asked' : 'not asked'}${other ? ' · the other side asked too' : ''}`}
                      onClick={() => onToggle(t.id, d.id)}
                      className={`relative block h-7 w-7 cursor-pointer text-[0.8rem] font-semibold hover:outline hover:outline-ink ${on ? askTint[mode] : 'text-faint'}`}
                    >
                      {on ? '✓' : ''}
                      {other && <OtherDot kind={mode} className="absolute right-0.5 bottom-0.5" />}
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

/** Pick one person on the asking side; tick everyone they want to meet on the other side. */
function RowEditor({
  project,
  names,
  mode,
  onSet,
}: {
  project: Project
  names: Map<Id, DisplayName>
  mode: AskKind
  onSet: (team: Id, dm: Id, wants: boolean) => void
}) {
  const askers: Participant[] = mode === 'dm' ? project.dms : project.teams
  const targets: Participant[] = mode === 'dm' ? project.teams : project.dms
  const [pickedId, setPicked] = useState<Id | null>(null)
  const asker = askers.find((a) => a.id === pickedId) ?? askers[0]
  const asks = mode === 'dm' ? project.dmAsks : project.teamAsks
  const otherAsks = mode === 'dm' ? project.teamAsks : project.dmAsks
  const pair = (asking: Id, target: Id): [Id, Id] => (mode === 'dm' ? [target, asking] : [asking, target])
  const asksOf = (a: Participant) => targets.filter((t) => asked(asks, ...pair(a.id, t.id))).length
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
            const on = asked(asks, team, dm)
            const other = asked(otherAsks, team, dm)
            return (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 hover:bg-canvas">
                  <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[0.9rem]">
                    <Name person={t} display={names.get(t.id)} className="flex" />
                    {other && (
                      <span className={`shrink-0 rounded-[2px] px-1 text-[0.68rem] font-semibold ${askTint[mode === 'dm' ? 'team' : 'dm']}`} title="They asked too">
                        they asked
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onSet(team, dm, e.target.checked)}
                    aria-label={`${asker.name} → ${t.name}`}
                    className={`h-5 w-5 shrink-0 cursor-pointer rounded-[3px] border border-rule ${mode === 'dm' ? 'accent-gold-3' : 'accent-sea-3'}`}
                  />
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
