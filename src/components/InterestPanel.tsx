import type { Dispatch, SetStateAction } from 'react'
import { asked, type Id } from '../lib/scheduler'
import { withAsk, withAsks, type AskKind, type Project } from '../lib/project'
import { Button, Empty, KeyItem, Name, Swatch, Tag } from './ui'
import { useNames } from './useNames'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

/**
 * One compact table for both sides' asks. Rows are teams and columns are
 * decision makers; every cell has a gold DM checkbox and a blue team checkbox.
 */
export function InterestPanel({ project, onChange }: Props) {
  const names = useNames(project)
  const hasPeople = project.teams.length > 0 && project.dms.length > 0

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <InterestKey />
        <div className="flex items-center gap-2">
          <Button variant="quiet" disabled={!hasPeople} onClick={() => confirm('Clear what decision makers asked?') && onChange(withAsks(project, {}, project.teamAsks))}>
            clear DM
          </Button>
          <Button variant="quiet" disabled={!hasPeople} onClick={() => confirm('Clear what teams asked?') && onChange(withAsks(project, project.dmAsks, {}))}>
            clear team
          </Button>
        </div>
      </div>
      {!hasPeople ? (
        <Empty>Add teams and decision makers under People first.</Empty>
      ) : (
        <InterestGrid project={project} names={names} onChange={onChange} />
      )}
    </section>
  )
}

function InterestKey() {
  return (
    <div className="flex items-center gap-3">
      <KeyItem swatch={<Swatch className="border-gold-3 bg-gold-2" />}>DM</KeyItem>
      <KeyItem swatch={<Swatch className="border-sea-3 bg-sea-2" />}>team</KeyItem>
    </div>
  )
}

/** Rows = teams, columns = decision makers, with both sides editable in each cell. */
function InterestGrid({ project, names, onChange }: { project: Project; names: ReturnType<typeof useNames>; onChange: Dispatch<SetStateAction<Project>> }) {
  return (
    <div className="max-h-[calc(100vh-7rem)] overflow-auto pb-3">
      <table className="mr-16 w-max border-separate border-spacing-0 text-[0.8rem]">
        <thead className="sticky top-0 z-20 bg-paper">
          <tr>
            <th className="sticky left-0 z-30 h-20 w-52 max-w-52 border-b border-rule bg-paper px-2 pb-1 text-left align-bottom font-semibold">Team</th>
            {project.dms.map((d) => (
              <th key={d.id} className="relative h-20 w-12 min-w-12 overflow-visible p-0 align-bottom font-normal" title={d.name}>
                <span className="absolute bottom-0 left-0 z-20 origin-bottom-left -rotate-[22deg] border-b border-rule pl-2 text-left text-[0.75rem] leading-tight whitespace-nowrap">
                  {names.get(d.id)?.code ?? d.name}
                  {names.get(d.id)?.tag && <Tag>{names.get(d.id)?.tag}</Tag>}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="outline outline-1 outline-rule">
          {project.teams.map((t) => (
            <tr key={t.id} className="group">
              <th
                scope="row"
                className="sticky left-0 z-10 w-52 max-w-52 border-l border-b border-rule bg-paper px-2 py-1 text-left text-[0.82rem] font-normal whitespace-nowrap group-hover:bg-canvas"
                title={t.name}
              >
                <Name person={t} display={names.get(t.id)} className="flex max-w-48" />
              </th>
              {project.dms.map((d) => {
                const dm = asked(project.dmAsks, t.id, d.id)
                const team = asked(project.teamAsks, t.id, d.id)
                return (
                  <td key={d.id} className="border-l border-b border-rule/70 px-1 py-1.5 group-hover:bg-canvas/50">
                    <div className="flex items-center justify-center gap-1">
                      <AskCheckbox kind="dm" checked={dm} team={t.id} dm={d.id} teamName={t.name} dmName={d.name} onChange={onChange} />
                      <AskCheckbox kind="team" checked={team} team={t.id} dm={d.id} teamName={t.name} dmName={d.name} onChange={onChange} />
                    </div>
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

function AskCheckbox({ kind, checked, team, dm, teamName, dmName, onChange }: { kind: AskKind; checked: boolean; team: Id; dm: Id; teamName: string; dmName: string; onChange: Dispatch<SetStateAction<Project>> }) {
  const who = kind === 'dm' ? dmName : teamName
  const target = kind === 'dm' ? teamName : dmName
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => {
        const wants = event.currentTarget.checked
        onChange((project) => withAsk(project, kind, team, dm, wants))
      }}
      aria-label={`${kind === 'dm' ? 'DM' : 'Team'} interest: ${who} asks for ${target}`}
      title={`${who} ${checked ? 'asks' : 'does not ask'} for ${target}`}
      className={`h-4 w-4 shrink-0 cursor-pointer rounded-[2px] ${kind === 'dm' ? 'accent-gold-3' : 'accent-sea-3'}`}
    />
  )
}
