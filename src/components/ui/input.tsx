import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-ink-subtle',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        className,
      )}
      {...props}
    />
  )
}
