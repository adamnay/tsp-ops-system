'use client'
import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, DollarSign, Briefcase, AlertCircle, Download, Target, Calendar } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  payment_pending: 'Finished – Needs Payment',
  partial_payment_received: 'Partial Payment',
  payment_received: 'Paid',
  disbursed: 'Disbursed',
  closed: 'Closed',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#5A6080',
  active: '#00D084',
  payment_pending: '#FFB800',
  partial_payment_received: '#00E5FF',
  payment_received: '#4ADE80',
  disbursed: '#8B91A8',
  closed: '#3A3D50',
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1A1D27',
  border: '1px solid #2A2D3E',
  borderRadius: '8px',
  color: '#F0F2F8',
  fontSize: '12px',
}

type DateRange = '30' | '90' | '365' | 'all'

function formatMonth(ym: string) {
  const [year, month] = ym.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function getLast12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

interface Props {
  deals: any[]        // non-future deals only
  futureDeals: any[]  // is_future deals
  payments: any[]     // confirmed, with matched_deal.brand/creator
}

export function SalesClient({ deals, futureDeals, payments }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'coming-up'>('overview')
  const [targetInput, setTargetInput] = useState('')
  const [editingTarget, setEditingTarget] = useState(false)
  const [topRange, setTopRange] = useState<DateRange>('all')

  const targetVal = parseFloat(targetInput.replace(/,/g, '')) || 0
  const last12 = useMemo(() => getLast12Months(), [])

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const totalPipeline = useMemo(
    () => deals.filter(d => !['draft', 'closed', 'disbursed'].includes(d.status)).reduce((s: number, d: any) => s + (d.brand_rate || 0), 0),
    [deals]
  )

  const totalConfirmed = useMemo(() => payments.reduce((s: number, p: any) => s + (p.amount || 0), 0), [payments])

  const avgDealValue = useMemo(() => {
    const won = deals.filter(d => ['payment_received', 'disbursed'].includes(d.status))
    return won.length ? won.reduce((s: number, d: any) => s + (d.brand_rate || 0), 0) / won.length : 0
  }, [deals])

  const paidPerDeal = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of payments) {
      if (p.matched_deal_id) map[p.matched_deal_id] = (map[p.matched_deal_id] || 0) + (p.amount || 0)
    }
    return map
  }, [payments])

  const totalOwed = useMemo(
    () => deals
      .filter(d => ['active', 'payment_pending', 'partial_payment_received'].includes(d.status))
      .reduce((s: number, d: any) => s + Math.max(0, (d.brand_rate || 0) - (paidPerDeal[d.id] || 0)), 0),
    [deals, paidPerDeal]
  )

  // ── Revenue by month ───────────────────────────────────────────────────────
  const revenueByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of payments) {
      const m = p.payment_date?.slice(0, 7)
      if (m) map[m] = (map[m] || 0) + (p.amount || 0)
    }
    return last12.map(m => ({ month: formatMonth(m), Revenue: map[m] || 0 }))
  }, [payments, last12])

  const revenueThisMonth = useMemo(
    () => payments.filter((p: any) => p.payment_date?.slice(0, 7) === thisMonth).reduce((s: number, p: any) => s + p.amount, 0),
    [payments, thisMonth]
  )
  const revenueLastMonth = useMemo(
    () => payments.filter((p: any) => p.payment_date?.slice(0, 7) === lastMonth).reduce((s: number, p: any) => s + p.amount, 0),
    [payments, lastMonth]
  )

  // ── Deal status distribution ───────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of deals) {
      if (d.status !== 'draft') map[d.status] = (map[d.status] || 0) + 1
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ name: STATUS_LABELS[status] || status, value: count, color: STATUS_COLORS[status] || '#8B91A8' }))
  }, [deals])

  // ── TSP commission by month ────────────────────────────────────────────────
  const tspByMonth = useMemo(() => {
    const map: Record<string, { tsp: number; brand: number }> = {}
    for (const d of deals) {
      if (d.status === 'draft') continue
      const date = d.contract_date || d.created_at
      const m = date?.slice(0, 7)
      if (!m) continue
      if (!map[m]) map[m] = { tsp: 0, brand: 0 }
      map[m].tsp += d.tsp_total || 0
      map[m].brand += d.brand_rate || 0
    }
    return last12.map(m => {
      const brand = map[m]?.brand || 0
      const tsp = map[m]?.tsp || 0
      const pct = brand > 0 ? Math.round((tsp / brand) * 100) : 0
      return { month: formatMonth(m), 'Brand Rate': brand, 'TSP Commission': tsp, tspPct: pct }
    })
  }, [deals, last12])

  const ProfitTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const brand = payload.find((p: any) => p.dataKey === 'Brand Rate')?.value || 0
    const tsp = payload.find((p: any) => p.dataKey === 'TSP Commission')?.value || 0
    const pct = brand > 0 ? ((tsp / brand) * 100).toFixed(1) : '0'
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
        <p className="text-xs font-medium text-[#F0F2F8] mb-1.5">{label}</p>
        <p className="text-xs text-[#5A6080]">Brand Rate: <span className="text-[#F0F2F8]">{formatCurrency(brand)}</span></p>
        <p className="text-xs text-[#00D084]">TSP Commission: {formatCurrency(tsp)} <span className="opacity-70">({pct}%)</span></p>
      </div>
    )
  }

  // ── Top brands / creators (date-range filtered) ────────────────────────────
  const filteredPayments = useMemo(() => {
    if (topRange === 'all') return payments
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - parseInt(topRange))
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return payments.filter((p: any) => p.payment_date >= cutoffStr)
  }, [payments, topRange])

  const topBrands = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {}
    for (const p of filteredPayments) {
      const bid = p.matched_deal?.brand_id
      const name = p.matched_deal?.brand?.brand_name
      if (!bid || !name) continue
      if (!map[bid]) map[bid] = { name, amount: 0 }
      map[bid].amount += p.amount || 0
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 3)
  }, [filteredPayments])

  const topCreators = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {}
    for (const p of filteredPayments) {
      const cid = p.matched_deal?.creator_id
      const name = p.matched_deal?.creator?.stage_name || p.matched_deal?.creator?.legal_name
      if (!cid || !name) continue
      if (!map[cid]) map[cid] = { name, amount: 0 }
      map[cid].amount += p.amount || 0
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 3)
  }, [filteredPayments])

  // ── Future deals summary ───────────────────────────────────────────────────
  const futureTotalBrandRate = futureDeals.reduce((s: number, d: any) => s + (d.brand_rate || 0), 0)
  const futureTotalTSP = futureDeals.reduce((s: number, d: any) => s + (d.tsp_total || 0), 0)
  const futureTotalCreatorPayout = futureDeals.reduce((s: number, d: any) => s + (d.creator_payout || 0), 0)

  const RANGE_LABELS: Record<DateRange, string> = { '30': 'Last 30d', '90': 'Last 90d', '365': 'Last Year', all: 'All Time' }

  return (
    <div className="space-y-6">
      {/* ── Header + Tabs ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Sales</h1>
          <div className="flex items-center gap-1 mt-3 bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-[#5A6080] hover:text-[#F0F2F8]'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('coming-up')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'coming-up' ? 'bg-[#FFB800]/10 text-[#FFB800]' : 'text-[#5A6080] hover:text-[#F0F2F8]'}`}
            >
              Coming Up
              {futureDeals.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeTab === 'coming-up' ? 'bg-[#FFB800]/20 text-[#FFB800]' : 'bg-[#2A2D3E] text-[#5A6080]'}`}>
                  {futureDeals.length}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {editingTarget ? (
              <>
                <span className="text-[#8B91A8] text-xs">Monthly Goal $</span>
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  placeholder="0"
                  className="w-28 bg-[#0F1117] border border-[#00E5FF]/40 rounded px-2 py-1 text-xs text-[#F0F2F8] focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => setEditingTarget(false)}
                  className="px-2 py-1 bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded text-xs text-[#00E5FF]"
                >
                  Done
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditingTarget(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg text-xs text-[#8B91A8] hover:text-[#F0F2F8] hover:border-[#00E5FF]/30 transition-colors"
              >
                <Target className="w-3.5 h-3.5" />
                {targetVal > 0 ? `Goal: ${formatCurrency(targetVal)}/mo` : 'Set Monthly Goal'}
              </button>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg text-xs text-[#8B91A8] hover:text-[#F0F2F8] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {activeTab === 'overview' && <div className="space-y-6">

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: 'Total Pipeline Value', value: formatCurrency(totalPipeline), sub: 'Active & in-progress', color: '#00E5FF', Icon: Briefcase },
          { label: 'Confirmed Revenue', value: formatCurrency(totalConfirmed), sub: 'Payments received', color: '#00D084', Icon: DollarSign },
          { label: 'Avg Won Deal', value: formatCurrency(avgDealValue), sub: 'Paid & disbursed deals', color: '#FFB800', Icon: TrendingUp },
          { label: 'Still Owed', value: formatCurrency(totalOwed), sub: "Brands haven't paid", color: '#FF4D6A', Icon: AlertCircle },
        ] as const).map(({ label, value, sub, color, Icon }) => (
          <div key={label} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-[#8B91A8] uppercase tracking-wider">{label}</p>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="font-mono text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-[10px] text-[#5A6080] mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Revenue by Month + Status Pie ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#F0F2F8]">Actual Revenue by Month</h3>
            {targetVal > 0 && (
              <span className="text-[10px] text-[#FFB800] flex items-center gap-1">
                <span className="inline-block w-4 border-t border-dashed border-[#FFB800]" />
                Goal {formatCurrency(targetVal)}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3E" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} />
              {targetVal > 0 && (
                <ReferenceLine
                  y={targetVal}
                  stroke="#FFB800"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: `$${(targetVal / 1000).toFixed(0)}k goal`, fill: '#FFB800', fontSize: 10, position: 'insideTopRight' }}
                />
              )}
              <Bar dataKey="Revenue" fill="#00E5FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[#F0F2F8] mb-3">Deal Status</h3>
          {statusDist.length === 0 ? (
            <p className="text-[#5A6080] text-sm text-center py-8">No deals yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value">
                    {statusDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, name: any) => [`${v} deal${v !== 1 ? 's' : ''}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {statusDist.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[#8B91A8]">{s.name}</span>
                    </div>
                    <span className="font-mono text-[#F0F2F8]">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── This Month / Last Month ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {([
          { label: 'Revenue Last Month', value: revenueLastMonth, month: lastMonth },
          { label: 'Revenue This Month', value: revenueThisMonth, month: thisMonth },
        ] as const).map(({ label, value, month }) => (
          <div key={label} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
            <h3 className="text-sm font-medium text-[#F0F2F8] mb-1">{label}</h3>
            <p className="font-mono text-3xl font-bold text-[#00E5FF] mb-4">{formatCurrency(value)}</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={[{ month: formatMonth(month), value }]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3E" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} />
                {targetVal > 0 && <ReferenceLine y={targetVal} stroke="#FFB800" strokeDasharray="5 5" strokeWidth={1.5} />}
                <Bar dataKey="value" fill="#00E5FF" radius={[4, 4, 0, 0]} maxBarSize={80} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* ── Profit Margins + Money Owed ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[#F0F2F8] mb-1">Profit Margins by Month</h3>
          <p className="text-[10px] text-[#5A6080] mb-4">TSP commission vs total brand rate</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tspByMonth} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3E" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5A6080', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip content={<ProfitTooltip />} />
              <Bar dataKey="Brand Rate" fill="#2A3050" radius={[4, 4, 0, 0]} />
              <Bar dataKey="TSP Commission" fill="#00D084" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="tspPct" position="top" formatter={(v: any) => v > 0 ? `${v}%` : ''} style={{ fill: '#00D084', fontSize: 10, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-[#5A6080]"><div className="w-3 h-2 rounded-sm bg-[#2A3050]" /> Brand Rate</div>
            <div className="flex items-center gap-1.5 text-xs text-[#5A6080]"><div className="w-3 h-2 rounded-sm bg-[#00D084]" /> TSP Commission</div>
          </div>
        </div>

        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
          <h3 className="text-sm font-medium text-[#F0F2F8] mb-1">Money Still Owed</h3>
          <p className="text-[10px] text-[#5A6080] mb-5">Deals with outstanding brand payments</p>
          <div className="divide-y divide-[#2A2D3E]">
            {(['active', 'payment_pending', 'partial_payment_received'] as const).map(status => {
              const group = deals.filter(d => d.status === status)
              if (!group.length) return null
              const total = group.reduce((s: number, d: any) => s + Math.max(0, (d.brand_rate || 0) - (paidPerDeal[d.id] || 0)), 0)
              return (
                <div key={status} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-[#F0F2F8]">{STATUS_LABELS[status]}</p>
                    <p className="text-[10px] text-[#5A6080] mt-0.5">{group.length} deal{group.length !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-mono font-semibold text-sm" style={{ color: STATUS_COLORS[status] }}>{formatCurrency(total)}</p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 mt-1 border-t border-[#2A2D3E]">
            <p className="text-sm font-semibold text-[#F0F2F8]">Total Outstanding</p>
            <p className="font-mono font-bold text-[#FF4D6A]">{formatCurrency(totalOwed)}</p>
          </div>
        </div>
      </div>

      {/* ── Top Brands & Creators by Revenue ────────────────────────────────── */}
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-medium text-[#F0F2F8]">Top Revenue Sources</h3>
            <p className="text-[10px] text-[#5A6080] mt-0.5">Confirmed payments by brand and creator</p>
          </div>
          <div className="flex items-center gap-1 bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-1">
            {(['30', '90', '365', 'all'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTopRange(r)}
                className={`px-3 py-1 rounded text-xs transition-colors ${topRange === r ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-[#5A6080] hover:text-[#F0F2F8]'}`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 3 Brands */}
          <div>
            <p className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Top 3 Brands</p>
            {topBrands.length === 0 ? (
              <p className="text-[#5A6080] text-sm py-4">No data for this period</p>
            ) : (
              <div className="space-y-3">
                {topBrands.map((b, i) => {
                  const max = topBrands[0].amount
                  const pct = max > 0 ? (b.amount / max) * 100 : 0
                  return (
                    <div key={b.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-[#F0F2F8] flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#5A6080] w-4">#{i + 1}</span>
                          {b.name}
                        </span>
                        <span className="font-mono text-[#00E5FF]">{formatCurrency(b.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-[#2A2D3E] rounded-full overflow-hidden">
                        <div className="h-full bg-[#00E5FF] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* Top 3 Creators */}
          <div>
            <p className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Top 3 Creators</p>
            {topCreators.length === 0 ? (
              <p className="text-[#5A6080] text-sm py-4">No data for this period</p>
            ) : (
              <div className="space-y-3">
                {topCreators.map((c, i) => {
                  const max = topCreators[0].amount
                  const pct = max > 0 ? (c.amount / max) * 100 : 0
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-[#F0F2F8] flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#5A6080] w-4">#{i + 1}</span>
                          {c.name}
                        </span>
                        <span className="font-mono text-[#00D084]">{formatCurrency(c.amount)}</span>
                      </div>
                      <div className="h-1.5 bg-[#2A2D3E] rounded-full overflow-hidden">
                        <div className="h-full bg-[#00D084] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      </div>}

      {/* ── Coming Up tab ───────────────────────────────────────────────────── */}
      {activeTab === 'coming-up' && (
        futureDeals.length === 0
          ? <div className="flex flex-col items-center justify-center py-24 text-center">
              <Calendar className="w-10 h-10 text-[#2A2D3E] mb-3" />
              <p className="text-[#5A6080] text-sm">No future deals yet</p>
              <p className="text-[#3A3D50] text-xs mt-1">Deals marked as future will appear here</p>
            </div>
          : <div className="border border-[#FFB800]/20 bg-[#FFB800]/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-[#FFB800]" />
            <div>
              <h3 className="text-sm font-medium text-[#F0F2F8]">Coming Up</h3>
              <p className="text-[10px] text-[#5A6080]">Future deals — not counted in live metrics above</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Future Deals', value: String(futureDeals.length), color: '#FFB800' },
              { label: 'Total Brand Rate', value: formatCurrency(futureTotalBrandRate), color: '#F0F2F8' },
              { label: 'Projected TSP Revenue', value: formatCurrency(futureTotalTSP), color: '#00D084' },
            ].map(s => (
              <div key={s.label} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-3">
                <p className="text-[10px] text-[#8B91A8] uppercase tracking-wider mb-1">{s.label}</p>
                <p className="font-mono text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-[#2A2D3E]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2D3E] bg-[#1A1D27]">
                  {['Campaign', 'Brand', 'Creator', 'Brand Rate', 'Creator Payout', 'TSP'].map(h => (
                    <th key={h} className="text-left py-2.5 px-4 text-[10px] font-medium text-[#8B91A8] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[#1A1D27]">
                {futureDeals.map((d: any) => (
                  <tr key={d.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-2.5 px-4 text-[#F0F2F8]">{d.campaign_name}</td>
                    <td className="py-2.5 px-4 text-[#8B91A8]">{d.brand?.brand_name || '—'}</td>
                    <td className="py-2.5 px-4 text-[#8B91A8]">{d.creator?.stage_name || d.creator?.legal_name || '—'}</td>
                    <td className="py-2.5 px-4 font-mono text-[#FFB800]">{formatCurrency(d.brand_rate)}</td>
                    <td className="py-2.5 px-4 font-mono text-[#8B91A8]">{formatCurrency(d.creator_payout)}</td>
                    <td className="py-2.5 px-4 font-mono text-[#00D084]">{formatCurrency(d.tsp_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
