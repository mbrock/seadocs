import { useEffect, useState } from 'react'
import { emptyProject, loadLocal, saveLocal, type Project } from './lib/state'
import { SaveBar } from './components/SaveBar'
import { SetupPanel } from './components/SetupPanel'
import { InterestPanel } from './components/InterestPanel'
import { SchedulePanel } from './components/SchedulePanel'
import type { Generated } from './lib/generate'
import { PersonPanel } from './components/PersonPanel'
import { TabButton } from './components/ui'

const TABS = [
  ['setup', '1. Setup'],
  ['prefs', '2. Interest'],
  ['schedule', '3. Schedule'],
  ['person', '4. Personal boards'],
] as const
type Tab = (typeof TABS)[number][0]

function headerStamp(project: Project): string {
  if (!project.teams.length && !project.dms.length) return 'empty project'
  const parts = [`${project.teams.length} teams`, `${project.dms.length} decision makers`, `${project.slotCount} slots`]
  if (project.meetings.length) parts.push(`${project.meetings.length} meetings`)
  return parts.join(' · ')
}

export default function App() {
  const [project, setProject] = useState<Project>(() => loadLocal() ?? emptyProject())
  const [tab, setTab] = useState<Tab>('setup')
  // The last generated frontier. Not persisted: generating is deterministic and quick.
  const [generated, setGenerated] = useState<Generated | null>(null)

  useEffect(() => saveLocal(project), [project])

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-7 pb-20 print:p-0">
      <header className="mb-[18px] flex items-end justify-between border-b-[3px] border-ink pb-3.5 print:hidden">
        <div>
          <h1 className="text-[28px] font-bold tracking-[0.5px]">Meeting Board</h1>
          <div className="font-mono text-[11px] uppercase tracking-[2px] text-teal">One-to-one scheduler — teams × decision makers</div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[2px] text-teal">{headerStamp(project)}</div>
      </header>

      <nav aria-label="Steps" className="mb-5 flex flex-wrap gap-0.5 print:hidden">
        {TABS.map(([id, label]) => (
          <TabButton key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </TabButton>
        ))}
      </nav>

      <SaveBar project={project} onChange={setProject} />

      {tab === 'setup' && <SetupPanel project={project} onChange={setProject} />}
      {tab === 'prefs' && <InterestPanel project={project} onChange={setProject} />}
      {tab === 'schedule' && <SchedulePanel project={project} onChange={setProject} generated={generated} onGenerated={setGenerated} />}
      {tab === 'person' && <PersonPanel project={project} />}

      <p className="mt-6 text-[12px] italic text-[#8a8471] print:hidden">
        Meeting Board ·{' '}
        <a className="underline" href="https://github.com/mbrock/seadocs">
          source
        </a>
      </p>
    </div>
  )
}
