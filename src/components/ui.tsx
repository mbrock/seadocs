import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Id, Participant } from '../lib/scheduler'
import type { DisplayName } from '../lib/names'

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
      <div className={`text-[1.25rem] leading-tight font-semibold tabular-nums ${colour}`}>{value}</div>
      <div className="eyebrow font-semibold normal-case tracking-normal">{label}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[0.9rem] text-muted">{children}</p>
}

export const inputClass = 'rounded-[3px] border border-rule bg-paper px-2 py-1.5 text-[0.85rem] focus:border-ink focus:outline-none'
export const textareaClass = `${inputClass} w-full resize-y leading-[1.5]`

/** Interest score 0..3 as background + text classes; rose for decision makers, sea for teams. */
export const scoreTint = {
  dm: ['', 'bg-rose-1 text-ink', 'bg-rose-2 text-ink', 'bg-rose-3 text-paper'],
  team: ['', 'bg-sea-1 text-ink', 'bg-sea-2 text-ink', 'bg-sea-3 text-paper'],
} as const

/** Small mono marker "3·2": decision-maker score, then team score. Zeros are dimmed. */
export function ScorePair({ dm, team }: { dm: number; team: number }) {
  return (
    <span className="text-[0.7rem] font-semibold tabular-nums" title={`decision maker ${dm}, team ${team}`}>
      <span className={dm ? '' : 'opacity-40'}>{dm}</span>
      <span className="opacity-40">·</span>
      <span className={team ? '' : 'opacity-40'}>{team}</span>
    </span>
  )
}

/**
 * A participant's name that truncates without losing its marks. With `display`
 * (from `displayNames`) it renders the short form plus the country tag:
 * "J. Cornejo ES".
 */
export function Name({
  person,
  display,
  className = '',
  lines = 1,
}: {
  person: Participant
  display?: DisplayName
  className?: string
  /** Allow wrapping to this many lines before clipping (default: single line, ellipsis). */
  lines?: 1 | 2
}) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-baseline ${className}`} title={person.name}>
      <span className={lines === 2 ? 'line-clamp-2 leading-[1.2] [overflow-wrap:anywhere]' : 'truncate'}>{display?.short ?? person.name}</span>
      {display?.tag && <Tag>{display.tag}</Tag>}
      <OnlineMark show={person.online} />
    </span>
  )
}

/** Small-caps style label, e.g. a country code after a name. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 shrink-0 self-center rounded-[2px] border border-rule px-[3px] text-[0.58rem] leading-[1.4] font-bold tracking-[0.08em] text-muted">{children}</span>
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

export interface ChooserGroup {
  title: string
  people: Participant[]
}

/**
 * Pick one person from grouped lists. A vertical list from `lg` up (meant for
 * a sticky side column); a single <select> below that.
 */
export function Chooser({
  groups,
  current,
  onPick,
  names,
  meta,
  label,
}: {
  groups: ChooserGroup[]
  current: Id | null
  onPick: (id: Id) => void
  names?: Map<Id, DisplayName>
  /** Small right-aligned annotation per row, e.g. a count. */
  meta?: (p: Participant) => ReactNode
  label: string
}) {
  return (
    <>
      <div className="px-4 py-3 lg:hidden">
        <select aria-label={label} value={current ?? ''} onChange={(e) => onPick(e.target.value)} className={`${inputClass} w-full`}>
          {groups.map((g) => (
            <optgroup key={g.title} label={g.title}>
              {g.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="hidden lg:block">
        {groups.map((g) => (
          <div key={g.title} className="border-b border-rule py-2 last:border-b-0">
            <div className="eyebrow px-4 py-1">{g.title}</div>
            <ul>
              {g.people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === current ? 'true' : undefined}
                    onClick={() => onPick(p.id)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-1 text-left text-[0.88rem] hover:bg-canvas ${
                      p.id === current ? 'bg-accent-soft font-semibold' : ''
                    }`}
                  >
                    <Name person={p} display={names?.get(p.id)} />
                    {meta && <span className="shrink-0 text-[0.75rem] text-muted tabular-nums">{meta(p)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}
