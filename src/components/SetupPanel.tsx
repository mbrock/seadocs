import { useState, type Dispatch, type SetStateAction } from 'react'
import { sampleProject } from '../lib/sample'
import { demoProject, parseLines, parseNames, withParticipants, withSlots, withTeamFloor, type Project } from '../lib/state'
import { Button, Card, CardTitle, FieldLabel, Hint, Stamp } from './ui'
import { inputClass, textareaClass } from './styles'

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
    teamsText: project.teams.map((t) => t.name).join('\n'),
    dmsText: project.dms.map((d) => d.name).join('\n'),
    slotCount: String(project.slotCount),
    labelsText: project.slotLabels.join('\n'),
    teamFloor: String(project.teamFloor),
  }
}

export function SetupPanel({ project, onChange }: Props) {
  // Drafts live here until "Save setup". Whenever a new project arrives
  // (apply, open file, demo, reset) the drafts are reset to match it.
  const [drafts, setDrafts] = useState(() => draftsFrom(project))
  const [seen, setSeen] = useState(project)
  if (project !== seen) {
    setSeen(project)
    setDrafts(draftsFrom(project))
  }
  const [stamp, setStamp] = useState('')
  const { teamsText, dmsText, slotCount, labelsText, teamFloor } = drafts
  const edit = (patch: Partial<Drafts>) => setDrafts((d) => ({ ...d, ...patch }))

  function apply() {
    let next = withParticipants(project, parseNames(teamsText), parseNames(dmsText))
    next = withSlots(next, slotCount, parseLines(labelsText))
    next = withTeamFloor(next, teamFloor)
    onChange(next)
    setStamp(`Saved: ${next.teams.length} teams, ${next.dms.length} decision makers, ${next.slotCount} slots.`)
  }

  function loadSample() {
    onChange(sampleProject())
    setStamp('Sample day loaded: 13 projects, 17 decision makers, 9 slots — see Interest and Schedule.')
  }

  function loadDemo() {
    onChange(demoProject())
    setStamp('Random 26 × 26 stress-test data loaded — see Interest and Schedule.')
  }

  return (
    <>
      <Card>
        <CardTitle>Participants</CardTitle>
        <Hint>
          One name per line. Teams become the columns of the interest grid, decision makers the rows. You can come back and add or
          remove names later without losing the interest you've already recorded.
        </Hint>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <FieldLabel htmlFor="teamsInput">Project teams</FieldLabel>
            <textarea
              id="teamsInput"
              className={`${textareaClass} min-h-[140px]`}
              placeholder={'Team A\nTeam B\n...'}
              value={teamsText}
              onChange={(e) => edit({ teamsText: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <FieldLabel htmlFor="dmsInput">Decision makers</FieldLabel>
            <textarea
              id="dmsInput"
              className={`${textareaClass} min-h-[140px]`}
              placeholder={'Commissioner A\nFund B\n...'}
              value={dmsText}
              onChange={(e) => edit({ dmsText: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Slots</CardTitle>
        <Hint>
          How many meeting slots are there across the day(s)? Every participant can have at most one meeting per slot, so this is
          also the most meetings any one person can have.
        </Hint>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <FieldLabel htmlFor="slotCount">Number of slots</FieldLabel>
            <input
              id="slotCount"
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={slotCount}
              onChange={(e) => edit({ slotCount: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <FieldLabel htmlFor="slotLabels">Slot labels (optional, one per line — e.g. times)</FieldLabel>
            <textarea
              id="slotLabels"
              className={`${textareaClass} min-h-[80px]`}
              placeholder={'09:00\n09:20\n09:40\n...'}
              value={labelsText}
              onChange={(e) => edit({ labelsText: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Fairness</CardTitle>
        <Hint>
          How many meetings should every team get at least? The scheduler treats this as a goal, not a rule: boards that leave a
          team short are shown with that count so you can weigh it against everything else. 0 turns it off.
        </Hint>
        <FieldLabel htmlFor="teamFloor">Minimum meetings per team</FieldLabel>
        <input
          id="teamFloor"
          type="number"
          min={0}
          max={60}
          className={inputClass}
          value={teamFloor}
          onChange={(e) => edit({ teamFloor: e.target.value })}
        />
      </Card>

      <Card>
        <Button variant="action" onClick={apply}>
          Save setup →
        </Button>
        <Button onClick={loadSample}>Load sample day (BSD 2026)</Button>
        <Button onClick={loadDemo}>Load random 26 × 26</Button>
        {stamp && <Stamp>{stamp}</Stamp>}
      </Card>
    </>
  )
}
