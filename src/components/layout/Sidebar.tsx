import {
  BarChart3,
  CreditCard,
  FileText,
  Home,
  Landmark,
  Settings,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  disabled?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/invoices', label: 'Invoices', icon: FileText, disabled: true },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard, disabled: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, disabled: true },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-4">
      <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Landmark className="h-5 w-5" />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => (
          <NavButton key={item.to} item={item} />
        ))}
      </nav>

      <NavButton item={{ to: '/settings', label: 'Settings', icon: Settings, disabled: true }} />
    </aside>
  )
}

function NavButton({ item }: { item: NavItem }) {
  const { to, label, icon: Icon, disabled } = item

  if (disabled) {
    return (
      <div className="group relative">
        <div className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-lg text-ink-subtle/50">
          <Icon className="h-5 w-5" />
        </div>
        <Tooltip label={`${label} (coming soon)`} />
      </div>
    )
  }

  return (
    <div className="group relative">
      <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          cn(
            'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
            isActive
              ? 'bg-brand-50 text-brand-600'
              : 'text-ink-subtle hover:bg-slate-100 hover:text-ink',
          )
        }
      >
        <Icon className="h-5 w-5" />
      </NavLink>
      <Tooltip label={label} />
    </div>
  )
}

function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {label}
    </span>
  )
}
