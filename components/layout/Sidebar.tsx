'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Users, Building2, CreditCard, ArrowLeftRight, Send, Activity, FileCheck, Landmark, Brain, BarChart2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales', label: 'Sales', icon: BarChart2 },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/brands', label: 'Brands', icon: Building2 },
  { href: '/deals', label: 'Deals', icon: FileText },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/payments/reconcile', label: 'Reconcile', icon: ArrowLeftRight },
  { href: '/disbursements', label: 'Disbursements', icon: Send },
  { href: '/escrow', label: 'Escrow', icon: Landmark },
  { href: '/contracts', label: 'Contracts', icon: FileCheck },
  { href: '/ai-knowledge', label: 'AI Knowledge', icon: Brain },
  { href: '/activity', label: 'Activity Log', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-[#1A1D27] border-r border-[#2A2D3E] min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#2A2D3E]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#00E5FF] flex items-center justify-center">
            <span className="text-[#0F1117] font-black text-xs">TSP</span>
          </div>
          <div>
            <p className="text-[#F0F2F8] font-semibold text-sm leading-tight">TSP Talent</p>
            <p className="text-[#5A6080] text-xs">Ops System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && href !== '/payments' ? pathname.startsWith(href) : pathname === href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                  : 'text-[#8B91A8] hover:text-[#F0F2F8] hover:bg-[#21253A]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#2A2D3E]">
        <p className="text-[#5A6080] text-xs">TSP Talent © 2026</p>
      </div>
    </aside>
  )
}
