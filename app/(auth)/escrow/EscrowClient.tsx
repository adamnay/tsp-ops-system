'use client'
import { useMemo } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Landmark, Download } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import Link from 'next/link'

interface Props {
  payments: any[]
  disbursements: any[]
}

export function EscrowClient({ payments, disbursements }: Props) {
  const brands = useMemo(() => {
    // Deduplicate by ID — the nested join (payments → deals → brands) can produce
    // duplicate rows if PostgREST resolves the relationship both ways
    const uniquePayments = Array.from(new Map(payments.map((p: any) => [p.id, p])).values())
    const uniqueDisbursements = Array.from(new Map(disbursements.map((d: any) => [d.id, d])).values())

    const map: Record<string, {
      brandId: string
      brandName: string
      totalReceived: number
      totalDisbursed: number
      payments: any[]
      disbursements: any[]
    }> = {}

    for (const p of uniquePayments) {
      const brand = p.matched_deal?.brand
      if (!brand) continue
      const key = brand.id
      if (!map[key]) map[key] = { brandId: brand.id, brandName: brand.brand_name, totalReceived: 0, totalDisbursed: 0, payments: [], disbursements: [] }
      map[key].totalReceived += p.amount
      map[key].payments.push(p)
    }

    for (const d of uniqueDisbursements) {
      const brand = d.deal?.brand
      if (!brand) continue
      const key = brand.id
      if (!map[key]) map[key] = { brandId: brand.id, brandName: brand.brand_name, totalReceived: 0, totalDisbursed: 0, payments: [], disbursements: [] }
      map[key].totalDisbursed += d.amount
      map[key].disbursements.push(d)
    }

    return Object.values(map)
      .filter(b => b.totalReceived - b.totalDisbursed > 0.005)
      .sort((a, b) => (b.totalReceived - b.totalDisbursed) - (a.totalReceived - a.totalDisbursed))
  }, [payments, disbursements])

  const totalEscrow = useMemo(() => {
    const uniqueP = Array.from(new Map(payments.map((p: any) => [p.id, p])).values())
    const uniqueD = Array.from(new Map(disbursements.map((d: any) => [d.id, d])).values())
    const totalIn = uniqueP.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    const totalOut = uniqueD.reduce((s: number, d: any) => s + (d.amount || 0), 0)
    return Math.max(0, totalIn - totalOut)
  }, [payments, disbursements])

  if (brands.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Escrow</h1>
          <p className="text-[#8B91A8] text-sm">Funds received but not yet disbursed</p>
        </div>
        <EmptyState icon={Landmark} title="No funds in escrow" description="Confirmed payments with pending disbursements will appear here" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Escrow</h1>
          <p className="text-[#8B91A8] text-sm">Funds received but not yet disbursed</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCSV(brands.map(b => ({ 'Brand': b.brandName, 'Total Received': b.totalReceived, 'Total Disbursed': b.totalDisbursed, 'Escrow Balance': b.totalReceived - b.totalDisbursed })), 'escrow')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg text-xs text-[#8B91A8] hover:text-[#F0F2F8] transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <div className="text-right">
            <p className="text-xs text-[#5A6080] uppercase tracking-wider mb-0.5">Total in Escrow</p>
            <p className="text-2xl font-bold font-mono text-[#00E5FF]">{formatCurrency(totalEscrow)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {brands.map(b => {
          const balance = b.totalReceived - b.totalDisbursed
          return (
            <div key={b.brandId} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl overflow-hidden">
              {/* Brand header */}
              <div className="px-5 py-4 bg-[#21253A] border-b border-[#2A2D3E] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#00E5FF]" />
                  <span className="font-semibold text-[#F0F2F8]">{b.brandName}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-[#5A6080]">
                    Received <span className="font-mono text-[#8B91A8]">{formatCurrency(b.totalReceived)}</span>
                  </span>
                  <span className="text-[#5A6080]">
                    Disbursed <span className="font-mono text-[#8B91A8]">{formatCurrency(b.totalDisbursed)}</span>
                  </span>
                  <span className="font-mono font-bold text-[#00E5FF]">{formatCurrency(balance)}</span>
                </div>
              </div>

              {/* Payments that contributed to escrow */}
              <div className="divide-y divide-[#2A2D3E]/50">
                {b.payments.map((p: any) => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[#5A6080] font-mono w-24">{formatDate(p.payment_date)}</span>
                      <span className="text-[#8B91A8]">{p.sender_name}</span>
                      {p.matched_deal && (
                        <Link href={`/deals/${p.matched_deal.id}`} className="text-xs font-mono text-[#5A6080] hover:text-[#00E5FF] transition-colors">
                          {p.matched_deal.deal_id}
                        </Link>
                      )}
                      {p.matched_deal?.campaign_name && (
                        <span className="text-xs text-[#5A6080]">{p.matched_deal.campaign_name}</span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-[#F0F2F8]">+{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
