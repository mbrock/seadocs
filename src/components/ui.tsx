import type { ButtonHTMLAttributes } from 'react'
import type { Asked, Project } from '../lib/project'
import { askedBy } from '../lib/describe'
import { sideStyle, type ParticipantName } from './useNames'

/** How components change the project: a function from the current project to the next. */
export type UpdateProject = (update: (project: Project) => Project) => void

const buttonStyles = {
  default: 'px-2 py-1 border border-rule bg-paper hover:border-ink disabled:hover:border-rule',
  quiet: 'px-1 py-0 text-muted hover:text-ink hover:underline',
}

export function Button({ variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-40 ${buttonStyles[variant]}`}
      {...props}
    />
  )
}

const markStyles = {
  both: 'bg-request-both',
  dm: 'bg-request-dm',
  team: 'bg-request-team',
  nobody: 'outline outline-1 outline-rule',
}

/** The request square: one colour per side, split when both asked, an empty outline when nobody did. */
export function RequestMark(asked: Asked) {
  const who = asked.dm && asked.team ? 'both' : asked.dm ? 'dm' : asked.team ? 'team' : 'nobody'
  return <span className={`inline-block size-4 shrink-0 align-middle ${markStyles[who]}`} title={askedBy(asked)} aria-label={askedBy(asked)} />
}

/** A participant's name with its country tag ("ES Cornejo"), in the surname/title form or as a board code. */
export function Name({ who, variant, className = '' }: { who: ParticipantName; variant: 'short' | 'code'; className?: string }) {
  return (
    <span className={`flex items-baseline whitespace-nowrap ${sideStyle[who.side]} ${className}`} title={who.name}>
      {who.tag && <span className="font-mono-matched mr-1 opacity-70">{who.tag}</span>}
      {who[variant]}
    </span>
  )
}
