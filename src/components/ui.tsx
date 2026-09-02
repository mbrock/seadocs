import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Participant } from '../lib/scheduler'
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
  return <section id={id} className={`rounded-[4px] border border-rule bg-paper ${className}`}>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-center text-muted">{children}</p>
}

/** The shared request square, optionally showing fulfillment with a check. */
export function RequestMark({
  dm,
  team,
  fulfilled = false,
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
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border text-white ${
        requested
          ? `border-transparent ${both ? '' : dm ? 'bg-emerald-600' : 'bg-sea-3'}`
          : showEmpty ? 'border-rule bg-paper' : 'invisible border-transparent'
      } ${className}`}
      style={both ? { background: 'linear-gradient(135deg, var(--color-emerald-600) 0 50%, var(--color-sea-3) 50% 100%)' } : undefined}
      title={askedBy(dm, team)}
      aria-label={askedBy(dm, team)}
    >
      {fulfilled && (
        <svg data-fulfillment-check aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
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

/** Country code shown as ordinary inline text before a name. */
function Tag({ children }: { children: ReactNode }) {
  return <span className="font-mono-matched mr-1 shrink-0 opacity-70">{children}</span>
}
