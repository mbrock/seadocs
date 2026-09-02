import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Participant } from '../lib/scheduler'
import type { DisplayName } from '../lib/names'
import { askedBy } from '../lib/describe'

type Variant = 'primary' | 'default' | 'quiet'

const buttonStyles: Record<Variant, string> = {
  primary: 'px-2 py-1 bg-ink text-paper hover:bg-accent disabled:hover:bg-ink',
  default: 'px-2 py-1 border border-rule bg-paper hover:border-ink disabled:hover:border-rule',
  quiet: 'px-1 py-0.5 text-muted hover:text-ink hover:underline',
}

export function Button({ variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Panel({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-[4px] border border-rule bg-paper ${className}`}>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-center text-muted">{children}</p>
}

/** One square: green for a DM ask, blue for a team ask, and diagonally split for both. */
export function AskMark({ dm, team }: { dm: boolean; team: boolean }) {
  const both = dm && team
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${both ? '' : dm ? 'bg-emerald-600' : team ? 'bg-sea-3' : 'invisible'}`}
      style={both ? { background: 'linear-gradient(135deg, var(--color-emerald-600) 0 50%, var(--color-sea-3) 50% 100%)' } : undefined}
      title={askedBy(dm, team)}
      aria-label={askedBy(dm, team)}
    />
  )
}

/**
 * A participant's name that truncates without losing its marks. With `display`
 * (from `displayNames`) it renders the surname plus the country tag:
 * "Cornejo ES". The `code` variant is for board cells: the title word for a
 * team ("Europe"), the surname for a person.
 */
export function Name({
  person,
  display,
  className = '',
  variant = 'short',
}: {
  person: Participant
  display?: DisplayName
  className?: string
  variant?: 'short' | 'code'
}) {
  const text = variant === 'code' ? (display?.code ?? person.name) : (display?.short ?? person.name)
  return (
    <span className={`inline-flex max-w-full min-w-0 items-baseline ${className}`} title={person.name}>
      {display?.tag && <Tag>{display.tag}</Tag>}
      <span className="truncate">{text}</span>
    </span>
  )
}

/** Small-caps style label, e.g. a country code after a name. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1 shrink-0 self-center rounded-[2px] border border-current/30 px-[3px] leading-[1.4] font-bold tracking-[0.08em] text-current opacity-70">
      {children}
    </span>
  )
}
