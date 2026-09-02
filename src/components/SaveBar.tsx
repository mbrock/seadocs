import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { emptyProject, type Project } from '../lib/project'
import { clearLocal, deserialize, serialize } from '../lib/persist'
import { download } from '../lib/csv'
import { Button, Card, CardTitle, Hint, Stamp } from './ui'

interface Props {
  project: Project
  onChange: Dispatch<SetStateAction<Project>>
}

export function SaveBar({ project, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [stamp, setStamp] = useState('')
  const isEmpty = project.teams.length === 0 && project.dms.length === 0

  function save() {
    download(`meeting-board-${new Date().toISOString().slice(0, 10)}.json`, serialize(project), 'application/json')
    setStamp('saved ' + new Date().toLocaleTimeString())
  }

  async function open(file: File) {
    try {
      onChange(deserialize(await file.text()))
      setStamp('opened ' + file.name)
    } catch (err) {
      setStamp(`Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function reset() {
    if (!confirm('Start over? This clears participants, interest and the schedule from this browser.')) return
    clearLocal()
    onChange(emptyProject())
    setStamp('cleared')
  }

  return (
    <Card muted className="print:hidden">
      <CardTitle>Saving</CardTitle>
      <Hint>
        Everything you do is saved automatically in this browser — nothing goes to a server. To move the project to another
        computer, or hand it to a colleague, save a project file and open it there.
      </Hint>
      <Button disabled={isEmpty} onClick={save}>
        Save project file
      </Button>
      <Button onClick={() => fileInput.current?.click()}>Open project file</Button>
      <Button variant="danger" disabled={isEmpty} onClick={reset}>
        Start over
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void open(file)
          e.target.value = ''
        }}
      />
      {stamp && <Stamp>{stamp}</Stamp>}
    </Card>
  )
}
