import { useState, type Dispatch, type SetStateAction } from 'react'
import { sampleProject } from '../lib/sample'
import { demoProject } from '../lib/fixtures'
import { parseLines, parseRoster, rosterText, withParticipants, withSlots, withTeamFloor, type Project } from '../lib/project'
import { Button, Label, Panel, PanelHeader, inputClass, textareaClass } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  teamsText: string
  dmsText: string
  slotCount: string
  labelsText: string
  teamFloor: string
}

function draftsFrom(project: Project): Drafts {
  return {
    teamsText: rosterText(project.teams),
    dmsText: rosterText(project.dms),
    slotCount: String(project.slots.length),
    labelsText: project.slots.map((s) => s.label).join('\n'),
    teamFloor: String(project.teamFloor),
  }
}

const same = (a: Drafts, b: Drafts) => (Object.keys(a) as (keyof Drafts)[]).every((k) => a[k] === b[k])

export function PeoplePanel({ project, onChange }: Props) {
  // Drafts live here until "Apply". Whenever a new project arrives (apply,
  // open file, sample, undo) the drafts are reset to match it.
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [seen, setSeen] = useState(project)
  if (project !== seen) {
    setSeen(project)
    setDrafts(draftsFrom(project))
  }
  const edit = (patch: Partial<Drafts>) => setDrafts((d) => ({ ...d, ...patch }))
  const dirty = !same(drafts, draftsFrom(project))
  const teamCount = parseRoster(drafts.teamsText).length
  const dmCount = parseRoster(drafts.dmsText).length

  function apply() {
    let next = withParticipants(project, parseRoster(drafts.teamsText), parseRoster(drafts.dmsText))
    next = withSlots(next, drafts.slotCount, parseLines(drafts.labelsText))
    next = withTeamFloor(next, drafts.teamFloor)
    onChange(next)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_minmax(16rem,20rem)]">
      <Panel>
        <PanelHeader title={`Teams · ${teamCount}`} />
        <div className="p-4">
          <textarea
            id="teamsInput"
            aria-label="Teams, one per line"
            className={`${textareaClass} min-h-[18rem]`}
            placeholder={'One project per line'}
            value={drafts.teamsText}
            onChange={(e) => edit({ teamsText: e.target.value })}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={`Decision makers · ${dmCount}`} />
        <div className="p-4">
          <textarea
            id="dmsInput"
            aria-label="Decision makers, one per line"
            className={`${textareaClass} min-h-[18rem]`}
            placeholder={'One person per line\nName | Organisation, Country\nEnd a line with * for someone joining online'}
            value={drafts.dmsText}
            onChange={(e) => edit({ dmsText: e.target.value })}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            One per line. A trailing <span className="font-mono">*</span> marks someone joining online.
          </p>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader title="Slots" />
          <div className="grid gap-3 p-4">
            <div>
              <Label htmlFor="slotCount">Number of slots</Label>
              <input
                id="slotCount"
                type="number"
                min={1}
                max={60}
                className={`${inputClass} w-24`}
                value={drafts.slotCount}
                onChange={(e) => edit({ slotCount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="slotLabels">Times, one per line</Label>
              <textarea
                id="slotLabels"
                className={`${textareaClass} min-h-[7rem]`}
                placeholder={'15:20\n15:40\n…'}
                value={drafts.labelsText}
                onChange={(e) => edit({ labelsText: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="teamFloor">Minimum meetings per team</Label>
              <input
                id="teamFloor"
                type="number"
                min={0}
                max={60}
                className={`${inputClass} w-24`}
                value={drafts.teamFloor}
                onChange={(e) => edit({ teamFloor: e.target.value })}
              />
              <p className="mt-1 text-[0.8rem] text-muted">A goal the boards are scored on, not a rule.</p>
            </div>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={apply} disabled={!dirty}>
            Apply
          </Button>
          {dirty && <span className="text-[0.8rem] text-muted">unapplied edits</span>}
        </div>

        <Panel>
          <PanelHeader title="Examples" />
          <div className="flex flex-wrap gap-2 p-4">
            <Button onClick={() => onChange(sampleProject())}>BSD 2026 sample day</Button>
            <Button onClick={() => onChange(demoProject())}>Random 26 × 26</Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
