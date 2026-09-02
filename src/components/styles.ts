// Shared Tailwind class strings (kept out of ui.tsx so that file only exports components).

export const textareaClass =
  'w-full resize-y border border-line bg-paper p-2.5 font-mono text-[13px] text-ink focus:outline-2 focus:outline-teal'

export const inputClass = 'w-[120px] border border-line bg-paper p-2 font-mono text-[13px] text-ink'

/** Background/text pairs for interest scores 0..3. */
export const scoreClass = ['bg-cream text-[#ccc]', 'bg-amber-pale text-[#8a6a1e]', 'bg-amber-dim text-[#6b4a0b]', 'bg-amber text-ink']
