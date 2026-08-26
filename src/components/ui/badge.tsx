import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
        success: 'bg-success-50 text-success-700 ring-green-200',
        warning: 'bg-warning-50 text-warning-700 ring-amber-200',
        danger: 'bg-danger-50 text-danger-700 ring-red-200',
        info: 'bg-info-50 text-info-700 ring-blue-200',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', {
            'bg-slate-500': variant === 'neutral' || !variant,
            'bg-success-600': variant === 'success',
            'bg-warning-600': variant === 'warning',
            'bg-danger-600': variant === 'danger',
            'bg-info-600': variant === 'info',
          })}
        />
      )}
      {children}
    </span>
  )
}
