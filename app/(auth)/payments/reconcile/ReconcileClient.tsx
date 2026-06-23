'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, XCircle, ArrowLeftRight, Brain, Ban, RefreshCw } from 'lucide-react'
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
    // Pre-populate with AI suggestions
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
  const supabase = createClient()
  const router = useRouter()

  const dealOptions = openDeals.map((d: any) => ({
    value: d.id,
    label: `${d.deal_id} — ${d.brand?.brand_name} × ${d.creator?.stage_name || d.creator?.legal_name} (${formatCurrency(d.brand_rate)})`,
  }))

  async function confirmMatch(payment: any) {
    const dealId = selectedDeals[payment.id]
    if (!dealId) return toast.error('Select a deal to match')

    const deal = openDeals.find((d: any) => d.id === dealId)
    if (!deal) return toast.error('Deal not found')

    setLoadingId(payment.id)

    try {
      // 1. Update payment
      const { error: paymentError } = await supabase.from('payments').update({
        match_status: 'confirmed',
        matched_deal_id: dealId,
        ai_suggested_deal_id: payment.ai_suggested_deal_id,
        confirmed_by: 'manual',
        confirmed_at: new Date().toISOString(),
      }).eq('id', payment.id)

      if (paymentError) throw paymentError

      // 2. One disbursement per deal — create on first payment, update fee on subsequent ones
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
        // Subsequent payment with a fee — subtract it from the existing creator disbursement
        const creatorDisb = existingDisbs.find((d: any) => d.recipient_type === 'creator')
        if (creatorDisb) {
          await supabase.from('disbursements').update({
            amount: Math.max(0, creatorDisb.amount - paypalFee),
          }).eq('id', creatorDisb.id)
        }
      }

      // 3. Update deal status based on cumulative payments
      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('matched_deal_id', deal.id)
        .eq('match_status', 'confirmed')
      const totalConfirmed = (allPayments || []).reduce((s: number, p: any) => s + p.amount, 0)
      await supabase.from('deals').update({
        status: totalConfirmed >= deal.brand_rate ? 'payment_received' : 'partial_payment_received',
      }).eq('id', deal.id)

      // Remove from queue
      setPayments(prev => prev.filter(p => p.id !== payment.id))
      logActivity({ action: 'Payment match confirmed', entity_type: 'payment', entity_id: payment.id, entity_label: `${payment.sender_name} → ${deal.deal_id}`, metadata: { deal_id: deal.id, deal_status_before: deal.status, prev_match_status: payment.match_status || 'ai_suggested' } })

      toast.success(`Matched to ${deal.deal_id} — disbursements queued`)

      // Propose brand profile updates if there's anything new to learn
      const brand = deal.brand
      let hasBrandUpdate = false
      if (brand) {
        const norm = (s: string) => s.trim().toLowerCase()
        const aliases: string[] = brand.aliases || []
        const methods: string[] = brand.payment_methods || []
        const hasNewAlias = norm(payment.sender_name) !== norm(brand.brand_name) && !aliases.some(a => norm(a) === norm(payment.sender_name))
        const hasNewMethod = payment.source && !methods.some(m => norm(m) === norm(payment.source))
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

      // Only refresh immediately if no brand update modal is pending
      // If there is one, refresh happens after the modal is dismissed
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
                  <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-3">Assign Deal</p>
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
