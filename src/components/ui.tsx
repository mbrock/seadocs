import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Participant } from '../lib/scheduler'

type Variant = 'primary' | 'default' | 'quiet' | 'danger'

const buttonStyles: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-accent disabled:hover:bg-ink',
  default: 'border border-rule bg-paper hover:border-ink disabled:hover:border-rule',
  quiet: 'text-muted hover:text-ink hover:underline px-1',
  danger: 'border border-rule text-warn hover:border-warn',
}

export function Button({ variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[0.85rem] font-semibold whitespace-nowrap disabled:cursor-default disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
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
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[0.8rem]' : 'px-3 py-1.5 text-[0.85rem]'
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
          className={`cursor-pointer font-semibold first:rounded-l-[2px] last:rounded-r-[2px] ${pad} ${
            o.value === value ? 'bg-ink text-paper' : 'text-muted hover:bg-canvas hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Label({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`eyebrow mb-1 block ${className}`}>
      {children}
    </label>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[4px] border border-rule bg-paper ${className}`}>{children}</section>
}

/** Panel title row: eyebrow-styled title on the left, controls on the right. */
export function PanelHeader({ title, children, className = '' }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5 ${className}`}>
      <h2 className="eyebrow text-ink">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** A number with a caption, for stat rows. */
export function Figure({ value, label, tone = 'ink' }: { value: ReactNode; label: string; tone?: 'ink' | 'warn' | 'muted' }) {
  const colour = tone === 'warn' ? 'text-warn' : tone === 'muted' ? 'text-muted' : 'text-ink'
  return (
    <div className="min-w-[5rem]">
      <div className={`font-mono text-[1.25rem] leading-tight font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="eyebrow font-semibold normal-case tracking-normal">{label}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[0.9rem] text-muted">{children}</p>
}

export const inputClass = 'rounded-[3px] border border-rule bg-paper px-2 py-1.5 font-mono text-[0.85rem] focus:border-ink focus:outline-none'
export const textareaClass = `${inputClass} w-full resize-y leading-[1.5]`

/** Interest score 0..3 as background + text classes; rose for decision makers, sea for teams. */
export const scoreTint = {
  dm: ['', 'bg-rose-1 text-ink', 'bg-rose-2 text-ink', 'bg-rose-3 text-paper'],
  team: ['', 'bg-sea-1 text-ink', 'bg-sea-2 text-ink', 'bg-sea-3 text-paper'],
} as const

/** Small mono marker "3·2": decision-maker score, then team score. Zeros are dimmed. */
export function ScorePair({ dm, team }: { dm: number; team: number }) {
  return (
    <span className="font-mono text-[0.7rem] tabular-nums" title={`decision maker ${dm}, team ${team}`}>
      <span className={dm ? '' : 'opacity-40'}>{dm}</span>
      <span className="opacity-40">·</span>
      <span className={team ? '' : 'opacity-40'}>{team}</span>
    </span>
  )
}

/**
 * A participant's name that truncates without losing the online mark.
 * `short` keeps only the part before the first "|" (name without affiliation).
 */
export function Name({ person, short = false, className = '' }: { person: Participant; short?: boolean; className?: string }) {
  const text = short ? person.name.split('|')[0].trim() : person.name
  return (
    <span className={`inline-flex max-w-full min-w-0 items-baseline ${className}`} title={person.name}>
      <span className="truncate">{text}</span>
      <OnlineMark show={person.online} />
    </span>
  )
}

/** Marks a participant who joins by video. */
export function OnlineMark({ show }: { show?: boolean }) {
  if (!show) return null
  return (
    <span title="joins online" aria-label="online" className="ml-1 inline-block align-middle font-mono text-[0.7rem] font-bold text-sea-3">
      ◌
    </span>
  )
}
