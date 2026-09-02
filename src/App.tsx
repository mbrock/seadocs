import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { emptyProject, type Project } from './lib/project'
import { loadLocal, saveLocal } from './lib/persist'
import { commit, initialHistory, redo, undo } from './lib/history'
import { Toolbar } from './components/Toolbar'
import { SetupPanel } from './components/SetupPanel'
import { BoardPanel } from './components/BoardPanel'

export default function App() {
  const [history, setHistory] = useState(() => initialHistory(loadLocal() ?? emptyProject()))
  const project = history.present
  const setProject: Dispatch<SetStateAction<Project>> = useCallback(
    (action) => setHistory((h) => commit(h, typeof action === 'function' ? action(h.present) : action)),
    [],
  )

  useEffect(() => saveLocal(project), [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return
      e.preventDefault()
      setHistory(e.shiftKey ? redo : undo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen flex-col print:block">
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas print:hidden">
        <div className="wrap flex flex-wrap items-center gap-x-5 gap-y-1 py-1.5">
          <span className="text-[0.85rem] font-extrabold tracking-[-0.02em] whitespace-nowrap">Meeting Board</span>
          <div className="ml-auto">
            <Toolbar
              project={project}
              onChange={setProject}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              onUndo={() => setHistory(undo)}
              onRedo={() => setHistory(redo)}
            />
          </div>
        </div>
      </header>

      <main className="wrap flex-1 py-3 print:p-0">
        <div className="flex flex-col gap-3">
          <SetupPanel project={project} onChange={setProject} />
          <section id="board" className="scroll-mt-12">
            <BoardPanel project={project} onChange={setProject} />
          </section>
        </div>
      </main>

      <footer className="wrap border-t border-rule py-3 text-[0.8rem] text-muted print:hidden">
        Meeting Board ·{' '}
        <a className="underline hover:text-ink" href="https://github.com/mbrock/seadocs">
          source
        </a>
      </footer>
    </div>
  )
}
