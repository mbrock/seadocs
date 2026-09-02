import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Participant, Side } from '../lib/scheduler'
import type { DisplayName } from '../lib/names'
import { askedBy } from '../lib/describe'

type Variant = 'primary' | 'default' | 'quiet'

const buttonStyles: Record<Variant, string> = {
  primary: 'px-2 py-1 bg-ink text-paper hover:bg-accent disabled:hover:bg-ink',
  default: 'px-2 py-1 border border-rule bg-paper hover:border-ink disabled:hover:border-rule',
  quiet: 'px-1 py-0 text-muted hover:text-ink hover:underline',
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
  return <section id={id} className={`rounded-[4px] bg-paper ${className}`}>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-center text-muted">{children}</p>
}

/** The shared request square; reduced opacity means the request is not on the board. */
export function RequestMark({
  dm,
  team,
  fulfilled = true,
  showEmpty = false,
  className = '',
}: {
  dm: boolean
  team: boolean
  fulfilled?: boolean
  showEmpty?: boolean
  className?: string
}) {
  const requested = dm || team
  const both = dm && team
  return (
    <span
      className={`block size-4 shrink-0 ${requested && !fulfilled ? 'opacity-45' : ''} ${
        requested
          ? both ? '' : dm ? 'bg-request-dm' : 'bg-request-team'
          : showEmpty ? 'bg-rule' : 'invisible'
      } ${className}`}
      style={both ? { background: 'linear-gradient(135deg, var(--color-request-dm) 0 50%, var(--color-request-team) 50% 100%)' } : undefined}
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
  side,
  className = '',
  variant = 'short',
}: {
  person: Participant
  display?: DisplayName
  side: Side
  className?: string
  variant?: 'short' | 'code'
}) {
  const text = variant === 'code' ? (display?.code ?? person.name) : (display?.short ?? person.name)
  return (
    <span className={`inline-flex max-w-full min-w-0 items-baseline ${side === 'team' ? 'italic' : ''} ${className}`} title={person.name}>
      {display?.tag && <Tag>{display.tag}</Tag>}
      <span className="truncate">{text}</span>
    </span>
  )
}

/** Country code shown as ordinary inline text before a name. */
function Tag({ children }: { children: ReactNode }) {
  return <span className="font-mono-matched mr-1 shrink-0 opacity-70">{children}</span>
}
