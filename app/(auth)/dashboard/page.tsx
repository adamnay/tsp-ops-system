import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DollarSign, AlertCircle, Clock, TrendingUp } from 'lucide-react'

async function getDashboardData() {
  const supabase = createClient()

  const [
    { data: confirmedPayments },
    { data: sentDisbursements },
    { count: unmatchedCount },
    { count: awaitingDisbursementCount },
    { data: recentPayments },
    { data: recentDeals },
  ] = await Promise.all([
    supabase.from('payments').select('id, amount').eq('match_status', 'confirmed'),
    supabase.from('disbursements').select('id, amount').in('status', ['sent', 'confirmed']),
    supabase.from('payments').select('*', { count: 'exact', head: true }).eq('match_status', 'unmatched'),
    supabase.from('disbursements').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('payments').select('*, matched_deal:deals!payments_matched_deal_id_fkey(deal_id, campaign_name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('deals').select('*, brand:brands(brand_name), creator:creators(stage_name, legal_name)').order('created_at', { ascending: false }).limit(5),
  ])

  // Deduplicate by ID (nested joins can produce duplicate rows) then compute net escrow
  const uniqueIn = Array.from(new Map((confirmedPayments ?? []).map(p => [p.id, p])).values())
  const uniqueOut = Array.from(new Map((sentDisbursements ?? []).map(d => [d.id, d])).values())
  const escrow = Math.max(0,
    uniqueIn.reduce((s, p) => s + p.amount, 0) - uniqueOut.reduce((s, d) => s + d.amount, 0)
  )

  return {
    escrow,
    unmatchedCount: unmatchedCount ?? 0,
    awaitingDisbursementCount: awaitingDisbursementCount ?? 0,
    recentPayments: recentPayments ?? [],
    recentDeals: recentDeals ?? [],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#F0F2F8]">Dashboard</h1>
        <p className="text-[#8B91A8] text-sm">TSP Talent operations overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Escrow Balance</CardTitle>
            <DollarSign className="w-4 h-4 text-[#00E5FF]" />
          </CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00E5FF]">{formatCurrency(data.escrow)}</p>
          <p className="text-[#5A6080] text-xs mt-1">Confirmed payments minus disbursed</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unmatched Payments</CardTitle>
            <AlertCircle className="w-4 h-4 text-[#FF4D6A]" />
          </CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#FF4D6A]">{data.unmatchedCount}</p>
          <p className="text-[#5A6080] text-xs mt-1">Need reconciliation</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Awaiting Disbursement</CardTitle>
            <Clock className="w-4 h-4 text-[#FFB800]" />
          </CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#FFB800]">{data.awaitingDisbursementCount}</p>
          <p className="text-[#5A6080] text-xs mt-1">Pending approval</p>
        </Card>
      </div>

      {/* Recent feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding={false}>
          <div className="px-5 py-4 border-b border-[#2A2D3E]">
            <CardTitle>Recent Payments</CardTitle>
          </div>
          <div className="divide-y divide-[#2A2D3E]/50">
            {data.recentPayments.length === 0 ? (
              <p className="px-5 py-8 text-center text-[#5A6080] text-sm">No payments yet</p>
            ) : (
              data.recentPayments.map((p: any) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#F0F2F8]">{p.sender_name}</p>
                    <p className="text-xs text-[#5A6080]">{formatDate(p.payment_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-[#F0F2F8]">{formatCurrency(p.amount)}</p>
                    <StatusBadge status={p.match_status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding={false}>
          <div className="px-5 py-4 border-b border-[#2A2D3E]">
            <CardTitle>Recent Deals</CardTitle>
          </div>
          <div className="divide-y divide-[#2A2D3E]/50">
            {data.recentDeals.length === 0 ? (
              <p className="px-5 py-8 text-center text-[#5A6080] text-sm">No deals yet</p>
            ) : (
              data.recentDeals.map((d: any) => (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#F0F2F8]">{d.campaign_name}</p>
                    <p className="text-xs text-[#5A6080]">{d.brand?.brand_name} × {d.creator?.stage_name || d.creator?.legal_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-[#F0F2F8]">{formatCurrency(d.brand_rate)}</p>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
