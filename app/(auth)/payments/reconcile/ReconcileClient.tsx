'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, XCircle, ArrowLeftRight, Brain, Ban, RefreshCw, Scissors, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/activity'

interface Props {
  initialPayments: any[]
  openDeals: any[]
}

export function ReconcileClient({ initialPayments, openDeals }: Props) {
  const [payments, setPayments] = useState(initialPayments)
  const [selectedDeals, setSelectedDeals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    initialPayments.forEach(p => {
      if (p.ai_suggested_deal_id) init[p.id] = p.ai_suggested_deal_id
    })
    return init
  })
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  const [brandUpdate, setBrandUpdate] = useState<{ brandId: string; brandName: string; newAlias: string | null; newMethod: string | null; currentAliases: string[]; currentMethods: string[] } | null>(null)
  const [savingBrandUpdate, setSavingBrandUpdate] = useState(false)
  const [splitModeIds, setSplitModeIds] = useState<Set<string>>(new Set())
  const [splitAllocations, setSplitAllocations] = useState<Record<string, { id: string; dealId: string; amount: string }[]>>({})
  const supabase = createClient()
  const router = useRouter()

  const dealOptions = openDeals.map((d: any) => ({
    value: d.id,
    label: `${d.deal_id} — ${d.brand?.brand_name} × ${d.creator?.stage_name || d.creator?.legal_name} (${formatCurrency(d.brand_rate)})`,
  }))

  // ── Split mode helpers ─────────────────────────────────────────────────────

  function enterSplitMode(paymentId: string) {
    setSplitModeIds(prev => { const next = new Set(prev); next.add(paymentId); return next })
    setSplitAllocations(prev => ({
      ...prev,
      [paymentId]: [
        { id: Math.random().toString(36).slice(2), dealId: '', amount: '' },
        { id: Math.random().toString(36).slice(2), dealId: '', amount: '' },
      ],
    }))
  }

  function exitSplitMode(paymentId: string) {
    setSplitModeIds(prev => { const next = new Set(prev); next.delete(paymentId); return next })
  }

  function addSplitRow(paymentId: string) {
    setSplitAllocations(prev => ({
      ...prev,
      [paymentId]: [...(prev[paymentId] || []), { id: Math.random().toString(36).slice(2), dealId: '', amount: '' }],
    }))
  }

  function removeSplitRow(paymentId: string, rowId: string) {
    setSplitAllocations(prev => ({
      ...prev,
      [paymentId]: (prev[paymentId] || []).filter(r => r.id !== rowId),
    }))
  }

  function updateSplitRow(paymentId: string, rowId: string, field: 'dealId' | 'amount', value: string) {
    setSplitAllocations(prev => ({
      ...prev,
      [paymentId]: (prev[paymentId] || []).map(r => r.id === rowId ? { ...r, [field]: value } : r),
    }))
  }

  function getFilteredDealOptions(paymentId: string, rowId: string) {
    const usedIds = (splitAllocations[paymentId] || []).filter(r => r.id !== rowId && r.dealId).map(r => r.dealId)
    return dealOptions.filter(opt => !usedIds.includes(opt.value))
  }

  // ── Confirm split ──────────────────────────────────────────────────────────

  async function confirmSplit(payment: any) {
    const allocations = splitAllocations[payment.id] || []
    const parsed = allocations.map(a => ({ dealId: a.dealId, amount: parseFloat(a.amount) }))

    if (parsed.some(a => !a.dealId || isNaN(a.amount) || a.amount <= 0)) {
      return toast.error('All rows must have a deal selected and a positive amount')
    }

    const totalAllocated = parsed.reduce((s, a) => s + a.amount, 0)
    if (Math.abs(totalAllocated - payment.amount) > 0.01) {
      return toast.error(`Allocations must sum to ${formatCurrency(payment.amount)} — currently ${formatCurrency(totalAllocated)}`)
    }

    setLoadingId(payment.id)
    const paypalFee = Math.abs(parseFloat(payment.raw_import_data?.paypal_fee || '0') || 0)

    try {
      // 1. Mark payment confirmed with no single deal
      const { error: paymentError } = await supabase.from('payments').update({
        match_status: 'confirmed',
        matched_deal_id: null,
        confirmed_by: 'manual',
        confirmed_at: new Date().toISOString(),
      }).eq('id', payment.id)
      if (paymentError) throw paymentError

      // 2. Insert allocation rows
      const { error: allocError } = await supabase.from('payment_allocations').insert(
        parsed.map(a => ({
          payment_id: payment.id,
          deal_id: a.dealId,
          allocated_amount: a.amount,
          paypal_fee: paypalFee > 0 ? Math.round((paypalFee * (a.amount / totalAllocated)) * 100) / 100 : 0,
        }))
      )
      if (allocError) throw allocError

      // 3. Disbursements + deal status per deal
      for (const alloc of parsed) {
        const deal = openDeals.find((d: any) => d.id === alloc.dealId)
        if (!deal) continue

        const proratedFee = paypalFee > 0
          ? Math.round((paypalFee * (alloc.amount / totalAllocated)) * 100) / 100
          : 0

        const { data: existingDisbs } = await supabase
          .from('disbursements')
          .select('id, amount, recipient_type')
          .eq('deal_id', deal.id)

        if (!existingDisbs || existingDisbs.length === 0) {
          const { error: disbError } = await supabase.from('disbursements').insert([
            {
              deal_id: deal.id,
              payment_id: payment.id,
              recipient_type: 'creator',
              recipient_name: deal.creator?.stage_name || deal.creator?.legal_name,
              amount: Math.max(0, deal.creator_payout - proratedFee),
              status: 'pending_approval',
            },
            {
              deal_id: deal.id,
              payment_id: payment.id,
              recipient_type: 'tsp',
              recipient_name: 'TSP Talent',
              amount: deal.tsp_total,
              status: 'pending_approval',
            },
          ])
          if (disbError) throw disbError
        } else if (proratedFee > 0) {
          const creatorDisb = existingDisbs.find((d: any) => d.recipient_type === 'creator')
          if (creatorDisb) {
            await supabase.from('disbursements').update({
              amount: Math.max(0, creatorDisb.amount - proratedFee),
            }).eq('id', creatorDisb.id)
          }
        }

        // Deal status: sum direct payments + allocations
        const [{ data: directPayments }, { data: dealAllocs }] = await Promise.all([
          supabase.from('payments').select('amount').eq('matched_deal_id', deal.id).eq('match_status', 'confirmed'),
          supabase.from('payment_allocations').select('allocated_amount').eq('deal_id', deal.id),
        ])
        const totalConfirmed =
          (directPayments || []).reduce((s: number, p: any) => s + p.amount, 0) +
          (dealAllocs || []).reduce((s: number, a: any) => s + a.allocated_amount, 0)

        await supabase.from('deals').update({
          status: totalConfirmed >= deal.brand_rate ? 'payment_received' : 'partial_payment_received',
        }).eq('id', deal.id)
      }

      setPayments(prev => prev.filter(p => p.id !== payment.id))
      logActivity({
        action: 'Split payment confirmed',
        entity_type: 'payment',
        entity_id: payment.id,
        entity_label: `${payment.sender_name} split across ${parsed.length} deals`,
        metadata: { deal_ids: parsed.map(a => a.dealId), amounts: parsed.map(a => a.amount) },
      })
      toast.success(`Split across ${parsed.length} deals — disbursements queued`)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    }

    setLoadingId(null)
  }

  // ── Confirm single deal match ──────────────────────────────────────────────

  async function confirmMatch(payment: any) {
    const dealId = selectedDeals[payment.id]
    if (!dealId) return toast.error('Select a deal to match')

    const deal = openDeals.find((d: any) => d.id === dealId)
    if (!deal) return toast.error('Deal not found')

    setLoadingId(payment.id)

    try {
      const { error: paymentError } = await supabase.from('payments').update({
        match_status: 'confirmed',
        matched_deal_id: dealId,
        ai_suggested_deal_id: payment.ai_suggested_deal_id,
        confirmed_by: 'manual',
        confirmed_at: new Date().toISOString(),
      }).eq('id', payment.id)

      if (paymentError) throw paymentError

      const paypalFee = Math.abs(parseFloat(payment.raw_import_data?.paypal_fee || '0') || 0)

      const { data: existingDisbs } = await supabase
        .from('disbursements')
        .select('id, amount, recipient_type')
        .eq('deal_id', deal.id)

      if (!existingDisbs || existingDisbs.length === 0) {
        const { error: disbError } = await supabase.from('disbursements').insert([
          {
            deal_id: deal.id,
            payment_id: payment.id,
            recipient_type: 'creator',
            recipient_name: deal.creator?.stage_name || deal.creator?.legal_name,
            amount: Math.max(0, deal.creator_payout - paypalFee),
            status: 'pending_approval',
          },
          {
            deal_id: deal.id,
            payment_id: payment.id,
            recipient_type: 'tsp',
            recipient_name: 'TSP Talent',
            amount: deal.tsp_total,
            status: 'pending_approval',
          },
        ])
        if (disbError) throw disbError
      } else if (paypalFee > 0) {
        const creatorDisb = existingDisbs.find((d: any) => d.recipient_type === 'creator')
        if (creatorDisb) {
          await supabase.from('disbursements').update({
            amount: Math.max(0, creatorDisb.amount - paypalFee),
          }).eq('id', creatorDisb.id)
        }
      }

      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('matched_deal_id', deal.id)
        .eq('match_status', 'confirmed')
      const totalConfirmed = (allPayments || []).reduce((s: number, p: any) => s + p.amount, 0)
      await supabase.from('deals').update({
        status: totalConfirmed >= deal.brand_rate ? 'payment_received' : 'partial_payment_received',
      }).eq('id', deal.id)

      setPayments(prev => prev.filter(p => p.id !== payment.id))
      logActivity({ action: 'Payment match confirmed', entity_type: 'payment', entity_id: payment.id, entity_label: `${payment.sender_name} → ${deal.deal_id}`, metadata: { deal_id: deal.id, deal_status_before: deal.status, prev_match_status: payment.match_status || 'ai_suggested' } })

      toast.success(`Matched to ${deal.deal_id} — disbursements queued`)

      const brand = deal.brand
      let hasBrandUpdate = false
      if (brand) {
        const norm = (s: string) => s.trim().toLowerCase()
        const aliases: string[] = brand.aliases || []
        const methods: string[] = brand.payment_methods || []
        const hasNewAlias = norm(payment.sender_name) !== norm(brand.brand_name) && !aliases.some((a: string) => norm(a) === norm(payment.sender_name))
        const hasNewMethod = payment.source && !methods.some((m: string) => norm(m) === norm(payment.source))
        if (hasNewAlias || hasNewMethod) {
          hasBrandUpdate = true
          setBrandUpdate({
            brandId: brand.id,
            brandName: brand.brand_name,
            newAlias: hasNewAlias ? payment.sender_name : null,
            newMethod: hasNewMethod ? payment.source : null,
            currentAliases: aliases,
            currentMethods: methods,
          })
        }
      }

      if (!hasBrandUpdate) router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    }

    setLoadingId(null)
  }

  async function applyBrandUpdate() {
    if (!brandUpdate) return
    setSavingBrandUpdate(true)
    const updates: any = {}
    if (brandUpdate.newAlias) updates.aliases = [...brandUpdate.currentAliases, brandUpdate.newAlias]
    if (brandUpdate.newMethod) updates.payment_methods = [...brandUpdate.currentMethods, brandUpdate.newMethod]
    const { error } = await supabase.from('brands').update(updates).eq('id', brandUpdate.brandId)
    if (error) {
      toast.error(error.message)
    } else {
      const parts = []
      if (brandUpdate.newAlias) { parts.push(`alias "${brandUpdate.newAlias}"`); logActivity({ action: 'Brand alias added', entity_type: 'brand', entity_id: brandUpdate.brandId, entity_label: `${brandUpdate.brandName} ← "${brandUpdate.newAlias}"`, metadata: { alias: brandUpdate.newAlias, prev_aliases: brandUpdate.currentAliases } }) }
      if (brandUpdate.newMethod) { parts.push(`payment method "${brandUpdate.newMethod}"`); logActivity({ action: 'Brand payment method added', entity_type: 'brand', entity_id: brandUpdate.brandId, entity_label: `${brandUpdate.brandName} ← ${brandUpdate.newMethod}`, metadata: { method: brandUpdate.newMethod, prev_methods: brandUpdate.currentMethods } }) }
      toast.success(`${brandUpdate.brandName} updated: ${parts.join(' & ')} added`)
    }
    setSavingBrandUpdate(false)
    setBrandUpdate(null)
    router.refresh()
  }

  async function reanalyze(payment: any) {
    setReanalyzingId(payment.id)
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: payment.id, payment }),
      })
      const result = await res.json()
      setPayments(prev => prev.map(p => p.id === payment.id ? {
        ...p,
        ai_match_confidence: result.confidence,
        ai_match_reasoning: result.reasoning,
        ai_suggested_deal_id: result.matched_deal_id || null,
      } : p))
      if (result.matched_deal_id) {
        setSelectedDeals(prev => ({ ...prev, [payment.id]: result.matched_deal_id }))
      }
      toast.success('AI analysis refreshed')
    } catch {
      toast.error('Re-analysis failed')
    }
    setReanalyzingId(null)
  }

  async function rejectMatch(payment: any) {
    setLoadingId(payment.id + '-reject')
    const { error } = await supabase.from('payments').update({
      match_status: 'rejected',
      ai_suggested_deal_id: payment.ai_suggested_deal_id,
    }).eq('id', payment.id)

    if (error) {
      toast.error(error.message)
    } else {
      setPayments(prev => prev.filter(p => p.id !== payment.id))
      toast.success('Payment marked as no match')
      logActivity({ action: 'Payment match rejected', entity_type: 'payment', entity_id: payment.id, entity_label: payment.sender_name, metadata: { prev_match_status: payment.match_status } })
    }
    setLoadingId(null)
  }

  async function ignorePayment(payment: any) {
    setLoadingId(payment.id + '-ignore')
    const { error } = await supabase.from('payments').update({
      match_status: 'ignored',
    }).eq('id', payment.id)

    if (error) {
      toast.error(error.message)
    } else {
      setPayments(prev => prev.filter(p => p.id !== payment.id))
      toast.success('Payment ignored and removed from queue')
      logActivity({ action: 'Payment ignored', entity_type: 'payment', entity_id: payment.id, entity_label: `${payment.sender_name} — ${formatCurrency(payment.amount)}`, metadata: { prev_match_status: payment.match_status } })
    }
    setLoadingId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#F0F2F8]">Reconciliation Queue</h1>
        <p className="text-[#8B91A8] text-sm">{payments.length} payment{payments.length !== 1 ? 's' : ''} need review</p>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Queue is clear"
          description="All payments have been reconciled. Great work."
        />
      ) : (
      <div className="space-y-4">
        {payments.map((payment: any) => {
          const aiDeal = openDeals.find((d: any) => d.id === payment.ai_suggested_deal_id)
          const isLoading = loadingId === payment.id
          const isRejecting = loadingId === payment.id + '-reject'
          const isIgnoring = loadingId === payment.id + '-ignore'
          const isReanalyzing = reanalyzingId === payment.id
          const isSplitMode = splitModeIds.has(payment.id)
          const rows = splitAllocations[payment.id] || []
          const totalAllocated = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
          const remaining = payment.amount - totalAllocated
          const splitReady = Math.abs(remaining) <= 0.01 && rows.every(r => r.dealId && parseFloat(r.amount) > 0)

          return (
            <div key={payment.id} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#2A2D3E]">
                {/* LEFT: Payment Details */}
                <div className="p-5">
                  <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-3">Incoming Payment</p>
                  <p className="font-mono text-2xl font-bold text-[#F0F2F8] mb-1">{formatCurrency(payment.amount)}</p>
                  <p className="text-[#F0F2F8] font-medium mb-3">{payment.sender_name}</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#5A6080]">Date</span>
                      <span className="text-[#8B91A8] font-mono">{formatDate(payment.payment_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A6080]">Source</span>
                      <span className="text-[#8B91A8] uppercase text-xs">{payment.source}</span>
                    </div>
                    {payment.memo && (
                      <div className="mt-2 pt-2 border-t border-[#2A2D3E]">
                        <p className="text-[#5A6080] text-xs mb-1">Memo</p>
                        <p className="text-[#8B91A8] text-xs font-mono break-all">{payment.memo}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* CENTER: AI Reasoning */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-[#00E5FF]" />
                    <p className="text-xs text-[#8B91A8] uppercase tracking-wider">AI Analysis</p>
                    {payment.ai_match_confidence && (
                      <StatusBadge status={payment.ai_match_confidence} />
                    )}
                    <button
                      onClick={() => reanalyze(payment)}
                      disabled={isReanalyzing || isLoading}
                      title="Re-run AI analysis"
                      className="ml-auto p-1 rounded text-[#5A6080] hover:text-[#00E5FF] transition-colors disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {payment.ai_match_reasoning ? (
                    <p className="text-sm text-[#8B91A8] leading-relaxed mb-4">{payment.ai_match_reasoning}</p>
                  ) : (
                    <p className="text-sm text-[#5A6080] italic mb-4">No AI analysis available</p>
                  )}

                  {aiDeal && (
                    <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-3">
                      <p className="text-xs text-[#5A6080] mb-1">AI Suggested Deal</p>
                      <p className="text-sm font-medium text-[#F0F2F8]">{aiDeal.campaign_name}</p>
                      <p className="text-xs text-[#8B91A8]">{aiDeal.brand?.brand_name} × {aiDeal.creator?.stage_name || aiDeal.creator?.legal_name}</p>
                      <div className="flex gap-3 mt-2 text-xs font-mono">
                        <span className="text-[#F0F2F8]">Brand: {formatCurrency(aiDeal.brand_rate)}</span>
                        <span className="text-[#00D084]">Creator: {formatCurrency(aiDeal.creator_payout)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT: Match Action */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[#8B91A8] uppercase tracking-wider">
                      {isSplitMode ? 'Split Across Deals' : 'Assign Deal'}
                    </p>
                    <button
                      onClick={() => isSplitMode ? exitSplitMode(payment.id) : enterSplitMode(payment.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        isSplitMode
                          ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                          : 'bg-[#2A2D3E] text-[#8B91A8] hover:text-[#F0F2F8] border border-[#3A3D50]'
                      }`}
                    >
                      <Scissors className="w-3 h-3" />
                      {isSplitMode ? 'Single Deal' : 'Split'}
                    </button>
                  </div>

                  {!isSplitMode ? (
                    // ── Single deal mode ─────────────────────────────────────
                    <div className="space-y-3">
                      <Select
                        value={selectedDeals[payment.id] || ''}
                        onChange={e => setSelectedDeals(prev => ({ ...prev, [payment.id]: e.target.value }))}
                        options={dealOptions}
                        placeholder="Select a deal..."
                      />

                      {selectedDeals[payment.id] && (() => {
                        const deal = openDeals.find((d: any) => d.id === selectedDeals[payment.id])
                        if (!deal) return null
                        const paypalFee = Math.abs(parseFloat(payment.raw_import_data?.paypal_fee || '0') || 0)
                        const adjustedCreatorPayout = Math.max(0, deal.creator_payout - paypalFee)
                        return (
                          <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-3 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[#5A6080]">Creator payout</span>
                              <span className="font-mono text-[#00D084]">{formatCurrency(adjustedCreatorPayout)}</span>
                            </div>
                            {paypalFee > 0 && (
                              <div className="flex justify-between">
                                <span className="text-[#5A6080]">PayPal fee deducted</span>
                                <span className="font-mono text-[#FF4D6A]">−{formatCurrency(paypalFee)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-[#5A6080]">TSP total</span>
                              <span className="font-mono text-[#00E5FF]">{formatCurrency(deal.tsp_total)}</span>
                            </div>
                            <div className="flex justify-between border-t border-[#2A2D3E] pt-1 mt-1">
                              <span className="text-[#5A6080]">Commission</span>
                              <span className="text-[#8B91A8]">{deal.tsp_commission_pct}%</span>
                            </div>
                          </div>
                        )
                      })()}

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => confirmMatch(payment)}
                          loading={isLoading}
                          disabled={!selectedDeals[payment.id] || isRejecting || isIgnoring}
                          className="flex-1 justify-center"
                        >
                          <CheckCircle className="w-4 h-4" /> Confirm
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => rejectMatch(payment)}
                          loading={isRejecting}
                          disabled={isLoading || isIgnoring}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => ignorePayment(payment)}
                          loading={isIgnoring}
                          disabled={isLoading || isRejecting}
                          title="Ignore this payment"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // ── Split mode ───────────────────────────────────────────
                    <div className="space-y-3">
                      {/* Running balance */}
                      <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#5A6080]">Total payment</span>
                          <span className="font-mono text-[#F0F2F8]">{formatCurrency(payment.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5A6080]">Allocated</span>
                          <span className="font-mono text-[#00D084]">{formatCurrency(totalAllocated)}</span>
                        </div>
                        <div className="flex justify-between border-t border-[#2A2D3E] pt-1 mt-1">
                          <span className="text-[#5A6080]">Remaining</span>
                          <span className={`font-mono font-semibold ${Math.abs(remaining) <= 0.01 ? 'text-[#00D084]' : remaining < 0 ? 'text-[#FF4D6A]' : 'text-[#FFB800]'}`}>
                            {Math.abs(remaining) <= 0.01 ? '✓ $0.00' : remaining < 0 ? `−${formatCurrency(Math.abs(remaining))} over` : formatCurrency(remaining)}
                          </span>
                        </div>
                      </div>

                      {/* Allocation rows */}
                      <div className="space-y-2">
                        {rows.map((row, i) => (
                          <div key={row.id} className="flex gap-2 items-center">
                            <select
                              value={row.dealId}
                              onChange={e => updateSplitRow(payment.id, row.id, 'dealId', e.target.value)}
                              className="flex-1 min-w-0 bg-[#0F1117] border border-[#2A2D3E] rounded-md px-2 py-1.5 text-xs text-[#F0F2F8] focus:outline-none focus:border-[#00E5FF] transition-colors"
                            >
                              <option value="">Deal {i + 1}…</option>
                              {getFilteredDealOptions(payment.id, row.id).map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                              {row.dealId && !getFilteredDealOptions(payment.id, row.id).find(o => o.value === row.dealId) && (
                                <option value={row.dealId}>{dealOptions.find(o => o.value === row.dealId)?.label}</option>
                              )}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.amount}
                              onChange={e => updateSplitRow(payment.id, row.id, 'amount', e.target.value)}
                              placeholder="0.00"
                              className="w-20 shrink-0 bg-[#0F1117] border border-[#2A2D3E] rounded-md px-2 py-1.5 text-xs text-[#F0F2F8] font-mono focus:outline-none focus:border-[#00E5FF] transition-colors"
                            />
                            {rows.length > 2 && (
                              <button
                                onClick={() => removeSplitRow(payment.id, row.id)}
                                className="text-[#5A6080] hover:text-[#FF4D6A] transition-colors shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => addSplitRow(payment.id)}
                        className="flex items-center gap-1 text-xs text-[#00E5FF] hover:text-[#00E5FF]/80 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add deal
                      </button>

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => confirmSplit(payment)}
                          loading={isLoading}
                          disabled={!splitReady || isRejecting || isIgnoring}
                          className="flex-1 justify-center"
                        >
                          <CheckCircle className="w-4 h-4" /> Confirm Split
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => rejectMatch(payment)}
                          loading={isRejecting}
                          disabled={isLoading || isIgnoring}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => ignorePayment(payment)}
                          loading={isIgnoring}
                          disabled={isLoading || isRejecting}
                          title="Ignore this payment"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Brand profile update confirmation */}
      <Modal open={!!brandUpdate} onClose={() => { setBrandUpdate(null); router.refresh() }} title="Update Brand Profile?" size="sm">
        {brandUpdate && (
          <div className="space-y-4">
            <p className="text-sm text-[#8B91A8]">
              Based on this payment, the AI suggests updating <span className="font-semibold text-[#F0F2F8]">{brandUpdate.brandName}</span>'s profile:
            </p>
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-3 space-y-2 text-sm">
              {brandUpdate.newAlias && (
                <div className="flex items-center gap-2">
                  <span className="text-[#5A6080] w-32 shrink-0">Add alias</span>
                  <span className="font-mono text-[#00E5FF]">"{brandUpdate.newAlias}"</span>
                </div>
              )}
              {brandUpdate.newMethod && (
                <div className="flex items-center gap-2">
                  <span className="text-[#5A6080] w-32 shrink-0">Add payment method</span>
                  <span className="font-mono text-[#00E5FF] uppercase">{brandUpdate.newMethod}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-[#5A6080]">This helps the AI recognize future payments from this brand automatically.</p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => { setBrandUpdate(null); router.refresh() }}>Skip</Button>
              <Button loading={savingBrandUpdate} onClick={applyBrandUpdate}>
                Update Profile
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
