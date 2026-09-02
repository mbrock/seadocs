import { useState, type Dispatch, type SetStateAction } from 'react'
import { sampleProject } from '../lib/sample'
import { demoProject } from '../lib/fixtures'
import { parseLines, parseRoster, rosterText, slotLabel, withParticipants, withSlots, withTitle, type Project } from '../lib/project'
import { Button, Label, Panel, PanelHeader, inputClass, textareaClass } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

interface Drafts {
  title: string
  teamsText: string
  dmsText: string
  /** One slot per line; the line is the slot's label. */
  slotsText: string
}

function draftsFrom(project: Project): Drafts {
  return {
    title: project.title,
    teamsText: rosterText(project.teams),
    dmsText: rosterText(project.dms),
    slotsText: project.slots.map((s) => slotLabel(project, s.id)).join('\n'),
  }
}

const same = (a: Drafts, b: Drafts) => (Object.keys(a) as (keyof Drafts)[]).every((k) => a[k] === b[k])

/** Who is coming and when: the rosters, the slot times, the event title. */
export function SetupPanel({ project, onChange }: Props) {
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
  const slotCount = parseLines(drafts.slotsText).length

  function apply() {
    let next = withParticipants(project, parseRoster(drafts.teamsText), parseRoster(drafts.dmsText))
    // A line that is just the default label ("Slot 3" on line 3) is stored as no label.
    next = withSlots(
      next,
      parseLines(drafts.slotsText).map((label, i) => (label === `Slot ${i + 1}` ? '' : label)),
    )
    next = withTitle(next, drafts.title)
    onChange(next)
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_minmax(16rem,20rem)]">
      <Panel>
        <PanelHeader title={`Teams · ${teamCount}`} />
        <div className="p-4">
          <textarea
            id="teamsInput"
            aria-label="Teams, one per line"
            className={`${textareaClass} min-h-[24rem]`}
            placeholder={'One project per line'}
            value={drafts.teamsText}
            onChange={(e) => edit({ teamsText: e.target.value })}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            One title per line. The board shows a one-word code picked from the title; write <b>Title = Code</b> to choose it yourself.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={`Decision makers · ${dmCount}`} />
        <div className="p-4">
          <textarea
            id="dmsInput"
            aria-label="Decision makers, one per line"
            className={`${textareaClass} min-h-[24rem]`}
            placeholder={'One person per line\nName | Organisation, Country\nEnd a line with * for someone joining online'}
            value={drafts.dmsText}
            onChange={(e) => edit({ dmsText: e.target.value })}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            One per line as <b>Name | Organisation, Country</b> — the country becomes a tag and long names are shortened on the board. A trailing <b>*</b> marks
            someone joining online. <b>Name = Code</b> sets the short form.
          </p>
        </div>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel>
          <PanelHeader title="Day" />
          <div className="grid gap-3 p-4">
            <div>
              <Label htmlFor="eventTitle">Event</Label>
              <input
                id="eventTitle"
                type="text"
                className={`${inputClass} w-full`}
                placeholder="Baltic Sea Docs 2026 · One-to-one meetings, day 1"
                value={drafts.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
              <p className="mt-1 text-[0.8rem] text-muted">Printed at the top of every running order.</p>
            </div>
            <div>
              <Label htmlFor="slotLabels">Slots · {slotCount}</Label>
              <textarea
                id="slotLabels"
                className={`${textareaClass} min-h-[12rem]`}
                placeholder={'15:20\n15:40\n…'}
                value={drafts.slotsText}
                onChange={(e) => edit({ slotsText: e.target.value })}
              />
              <p className="mt-1 text-[0.8rem] text-muted">One line per meeting slot, in order. Someone who cannot make a slot is marked on the board.</p>
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
