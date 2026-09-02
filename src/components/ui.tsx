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
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] text-[0.85rem] font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

/** A radio group that looks like connected buttons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[3px] border border-rule bg-paper">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          title={o.title}
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer px-2 py-0.5 text-[0.8rem] font-semibold first:rounded-l-[2px] last:rounded-r-[2px] ${
            o.value === value ? 'bg-ink text-paper' : 'text-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[4px] border border-rule bg-paper ${className}`}>{children}</section>
}

/** Panel title row: eyebrow-styled title on the left, controls on the right. */
export function PanelHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule px-2 py-1">
      <h2 className="eyebrow text-ink">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-3 text-center text-[0.9rem] text-muted">{children}</p>
}

/** Two small marks: gold when the decision maker asked, sea when the team asked; hollow otherwise. */
export function AskPair({ dm, team }: { dm: boolean; team: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={askedBy(dm, team)} aria-label={askedBy(dm, team)}>
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full border ${dm ? 'border-gold-3 bg-gold-3' : 'border-rule'}`} />
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full border ${team ? 'border-sea-3 bg-sea-3' : 'border-rule'}`} />
    </span>
  )
}

/**
 * A participant's name that truncates without losing its marks. With `display`
 * (from `displayNames`) it renders the short form plus the country tag:
 * "J. Cornejo ES". The `code` variant is for board cells: the title word for a
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
      <span className="truncate">{text}</span>
      {display?.tag && <Tag>{display.tag}</Tag>}
      <OnlineMark show={person.online} />
    </span>
  )
}

/** Small-caps style label, e.g. a country code after a name. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1 shrink-0 self-center rounded-[2px] border border-current/30 px-[3px] text-[0.58rem] leading-[1.4] font-bold tracking-[0.08em] text-current opacity-70">
      {children}
    </span>
  )
}

/** Marks a participant who joins by video. */
export function OnlineMark({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <span title="joins online" aria-label="online" className="ml-1 inline-block align-middle text-[0.7rem] font-bold text-sea-3">
      ◌
    </span>
  )
}
