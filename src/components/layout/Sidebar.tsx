import {
  BarChart3,
  Banknote,
  Cog,
  CreditCard,
  FileText,
  Home,
  Landmark,
  Link2,
  ListChecks,
  Package,
  Percent,
  Plug,
  RefreshCw,
  Settings,
  Share2,
  Tag,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  disabled?: boolean
}

interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/customers', label: 'Customers', icon: Users },
]

const billingGroup: NavGroup = {
  label: 'Billing',
  icon: Wallet,
  items: [
    { to: '/invoices', label: 'Invoices', icon: FileText, disabled: true },
    { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  ],
}

const catalogGroup: NavGroup = {
  label: 'Catalog',
  icon: Package,
  items: [
    { to: '/products', label: 'Products', icon: Package },
    { to: '/offers', label: 'Offers', icon: Tag, disabled: true },
    { to: '/public-signup-pages', label: 'Public Signup Pages', icon: Link2, disabled: true },
    { to: '/offer-signup-pages', label: 'Offer Signup Pages', icon: Link2, disabled: true },
  ],
}

const trailingNavItems: NavItem[] = [{ to: '/reports', label: 'Reports', icon: BarChart3, disabled: true }]

const configureGroup: NavGroup = {
  label: 'Configure',
  icon: Settings,
  items: [
    { to: '/configure/settings', label: 'Settings', icon: Cog, disabled: true },
    { to: '/configure/payment-gateways', label: 'Payment Gateways', icon: Banknote, disabled: true },
    { to: '/configure/integrations', label: 'Integrations', icon: Plug },
    { to: '/configure/custom-fields', label: 'Custom Fields', icon: ListChecks, disabled: true },
    { to: '/configure/invoicing', label: 'Invoicing', icon: FileText, disabled: true },
    { to: '/configure/referrals', label: 'Referrals', icon: Share2, disabled: true },
    { to: '/configure/taxes', label: 'Taxes', icon: Percent, disabled: true },
    { to: '/configure/retries-dunning', label: 'Retries & Dunning', icon: RefreshCw, disabled: true },
  ],
}

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
        <NavGroupMenu group={catalogGroup} />
        <NavGroupMenu group={billingGroup} />
        {trailingNavItems.map((item) => (
          <NavButton key={item.to} item={item} />
        ))}
      </nav>

      <NavGroupMenu group={configureGroup} align="end" />
    </aside>
  )
}

function NavGroupMenu({ group, align = 'start' }: { group: NavGroup; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const isActive = group.items.some((item) => location.pathname.startsWith(item.to))
  const Icon = group.icon

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="group relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
          isActive || open ? 'bg-brand-50 text-brand-600' : 'text-ink-subtle hover:bg-slate-100 hover:text-ink',
        )}
      >
        <Icon className="h-5 w-5" />
      </button>
      {!open && <Tooltip label={group.label} />}

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute left-full z-20 ml-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg',
            align === 'end' ? 'bottom-0' : 'top-0',
          )}
        >
          <div className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            {group.label}
          </div>
          {group.items.map((item) => {
            const ItemIcon = item.icon
            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="flex cursor-not-allowed items-center gap-2.5 px-3 py-2 text-sm text-ink-subtle/60"
                >
                  <ItemIcon className="h-4 w-4" />
                  {item.label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                </div>
              )
            }
            return (
              <button
                key={item.to}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate(item.to)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  location.pathname.startsWith(item.to)
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-ink hover:bg-slate-50',
                )}
              >
                <ItemIcon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
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
