import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function Sheet({ open, onClose, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-50 transition-[visibility] duration-300',
        open ? 'visible' : 'invisible',
      )}
    >
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-slate-900/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Close panel"
        className="rounded-md p-1.5 text-ink-subtle hover:bg-slate-100 hover:text-ink"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
