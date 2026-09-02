import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({ children, muted = false, className = '' }: { children: ReactNode; muted?: boolean; className?: string }) {
  return (
    <section className={`mb-[18px] rounded-sm border border-line p-5 ${muted ? 'bg-paper-dim' : 'bg-cream'} ${className}`}>
      {children}
    </section>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 font-mono text-[15px] font-semibold uppercase tracking-[1.5px]">{children}</h2>
}

export function Hint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mb-3.5 text-[13px] italic text-muted ${className}`}>{children}</p>
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-[11px] uppercase tracking-[1px] text-teal">
      {children}
    </label>
  )
}

export function Stamp({ children }: { children: ReactNode }) {
  return <span className="ml-2.5 font-mono text-[11px] text-teal">{children}</span>
}

type Variant = 'action' | 'ghost' | 'danger'

const buttonStyles: Record<Variant, string> = {
  action:
    'mt-2.5 mr-2 bg-amber px-5 py-[11px] text-[12px] font-bold text-ink hover:bg-amber-deep disabled:opacity-40 disabled:hover:bg-amber',
  ghost:
    'mt-2.5 mr-2 border border-teal bg-transparent px-3.5 py-2 text-[11px] text-teal hover:bg-teal hover:text-cream disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-teal',
  danger:
    'mt-2.5 mr-2 border border-brick bg-transparent px-3.5 py-2 text-[11px] text-brick hover:bg-brick hover:text-cream disabled:opacity-40',
}

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`cursor-pointer font-mono uppercase tracking-[1px] disabled:cursor-default ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer border px-[18px] py-2.5 font-mono text-[12px] uppercase tracking-[1.5px] ${
        active ? 'border-ink bg-ink text-paper' : 'border-line bg-paper-dim text-ink opacity-55 hover:opacity-80'
      }`}
    >
      {children}
    </button>
  )
}
