'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Send, CheckCircle, Download, Clock, Trash2 } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  initialDisbursements: any[]
  paypalFeesByDeal: Record<string, number>
}

export function DisbursementsClient({ initialDisbursements, paypalFeesByDeal }: Props) {
  const [disbursements, setDisbursements] = useState<any[]>(initialDisbursements)

  function handleExportCSV() {
    downloadCSV(
      disbursements.map((d: any) => ({
        'Recipient': d.recipient_name || '', 'Type': d.recipient_type || '', 'Amount': d.amount,
        'Status': d.status, 'Deal': d.deal?.deal_id || '', 'Campaign': d.deal?.campaign_name || '',
        'Brand': d.deal?.brand?.brand_name || '', 'Creator': d.deal?.creator?.stage_name || d.deal?.creator?.legal_name || '',
        'Created': d.created_at?.slice(0, 10) || '',
      })),
      'disbursements'
    )
  }
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleting, setDeleting] = useState(false)
  const [pendingSend, setPendingSend] = useState<string | null>(null)
  const [pendingMethodConfirm, setPendingMethodConfirm] = useState<{
    disbId: string
    forcePartial: boolean
    creatorId: string | null
    creatorName: string
    creatorStoredMethod: string | null
    selectedMethod: string
  } | null>(null)
  const [pendingCreatorMethodUpdate, setPendingCreatorMethodUpdate] = useState<{
    creatorId: string
    creatorName: string
    oldMethod: string | null
    newMethod: string
  } | null>(null)
  const [savingCreatorMethod, setSavingCreatorMethod] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  // Unique brands present in disbursements
  const availableBrands = useMemo(() => {
    const seen = new Set<string>()
    const brands: { id: string; name: string }[] = []
    disbursements.forEach(d => {
      const name = d.deal?.brand?.brand_name
      if (name && !seen.has(name)) {
        seen.add(name)
        brands.push({ id: name, name })
      }
    })
    return brands.sort((a, b) => a.name.localeCompare(b.name))
  }, [disbursements])

  const filtered = useMemo(() =>
    brandFilter === 'all' ? disbursements : disbursements.filter(d => d.deal?.brand?.brand_name === brandFilter),
    [disbursements, brandFilter]
  )

  const queueItems = useMemo(() =>
    filtered.filter(d => ['pending_approval', 'approved'].includes(d.status)),
    [filtered]
  )

  const historyItems = useMemo(() =>
    filtered.filter(d => ['sent', 'confirmed'].includes(d.status)),
    [filtered]
  )

  // Group queue by recipient (creator payouts first, grouped by creator name)
  const groupedQueue = useMemo(() => {
    const groups: Record<string, any[]> = {}
    queueItems.forEach(d => {
      const key = d.recipient_name
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    })
    // Sort: creators first, then TSP
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'TSP Talent') return 1
      if (b === 'TSP Talent') return -1
      return a.localeCompare(b)
    })
  }, [queueItems])

  async function setLoading(id: string, loading: boolean) {
    setLoadingIds(prev => {
      const next = new Set(prev)
      loading ? next.add(id) : next.delete(id)
      return next
    })
  }

  async function approve(id: string, force = false) {
    // Warn before approving if deal hasn't been fully paid
    if (!force) {
      const d = disbursements.find((x: any) => x.id === id)
      if (d?.deal && d.deal.status !== 'payment_received' && d.deal.status !== 'disbursed') {
        setPendingSend(id)
        return
      }
    }

    await setLoading(id, true)
    const { error } = await supabase.from('disbursements').update({
      status: 'approved',
      approved_by: 'ops',
      approved_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) { toast.error(error.message) } else {
      setDisbursements(prev => prev.map(d => d.id === id ? { ...d, status: 'approved', approved_by: 'ops', approved_at: new Date().toISOString() } : d))
      toast.success('Disbursement approved')
      const d = disbursements.find((d: any) => d.id === id)
      if (d) logActivity({ action: 'Disbursement approved', entity_type: 'disbursement', entity_id: id, entity_label: `${d.recipient_name} — ${formatCurrency(d.amount)}`, metadata: { prev_status: 'pending_approval' } })
    }
    await setLoading(id, false)
  }

  async function markSent(id: string, force = false, method?: string) {
    const d = disbursements.find((x: any) => x.id === id)

    // For creator disbursements, always confirm payment method first
    if (!method && d?.recipient_type === 'creator') {
      const creator = d.deal?.creator
      const storedMethod = creator?.payment_method || null
      setPendingMethodConfirm({
        disbId: id,
        forcePartial: force,
        creatorId: creator?.id || null,
        creatorName: d.recipient_name,
        creatorStoredMethod: storedMethod,
        selectedMethod: storedMethod || '',
      })
      return
    }

    await setLoading(id, true)
    const { error } = await supabase.from('disbursements').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      ...(method ? { payment_method: method } : {}),
    }).eq('id', id)

    if (error) { toast.error(error.message) } else {
      setDisbursements(prev => prev.map(x => x.id === id ? { ...x, status: 'sent', sent_at: new Date().toISOString(), ...(method ? { payment_method: method } : {}) } : x))
      toast.success('Marked as sent')
      if (d) logActivity({ action: 'Disbursement marked as sent', entity_type: 'disbursement', entity_id: id, entity_label: `${d.recipient_name} — ${formatCurrency(d.amount)}`, metadata: { prev_status: 'approved', payment_method: method } })

      // Auto-complete deal when all disbursements are sent
      if (d?.deal_id) {
        const { data: dealDisbs } = await supabase
          .from('disbursements')
          .select('id, status')
          .eq('deal_id', d.deal_id)
        const allSent = dealDisbs && dealDisbs.length >= 2 &&
          dealDisbs.every((x: any) => ['sent', 'confirmed'].includes(x.status))
        if (allSent) {
          const { error: dealErr } = await supabase.from('deals').update({ status: 'disbursed' }).eq('id', d.deal_id)
          if (!dealErr) {
            toast.success(`${d.deal?.deal_id || 'Deal'} marked as disbursed`)
            logActivity({ action: 'Deal auto-marked as disbursed', entity_type: 'deal', entity_id: d.deal_id, entity_label: d.deal?.deal_id || d.deal_id, metadata: { trigger: 'all_disbursements_sent' } })
          }
        }
      }

      router.refresh()
    }
    await setLoading(id, false)
  }

  async function confirmMethodAndSend() {
    if (!pendingMethodConfirm) return
    const { disbId, forcePartial, creatorId, creatorName, creatorStoredMethod, selectedMethod } = pendingMethodConfirm
    setPendingMethodConfirm(null)

    // Check if method differs from stored — if so, queue up the update prompt after sending
    const methodChanged = selectedMethod && selectedMethod !== creatorStoredMethod

    await markSent(disbId, forcePartial, selectedMethod || undefined)

    if (methodChanged && creatorId) {
      setPendingCreatorMethodUpdate({
        creatorId,
        creatorName,
        oldMethod: creatorStoredMethod,
        newMethod: selectedMethod,
      })
    }
  }

  async function saveCreatorMethod() {
    if (!pendingCreatorMethodUpdate) return
    setSavingCreatorMethod(true)
    const { creatorId, creatorName, newMethod } = pendingCreatorMethodUpdate
    const { error } = await supabase.from('creators').update({ payment_method: newMethod }).eq('id', creatorId)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(`${creatorName}'s payment method updated to ${newMethod}`)
      logActivity({ action: 'Creator payment method updated', entity_type: 'creator', entity_id: creatorId, entity_label: creatorName, metadata: { prev_method: pendingCreatorMethodUpdate.oldMethod, new_method: newMethod } })
      setPendingCreatorMethodUpdate(null)
    }
    setSavingCreatorMethod(false)
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDelete() {
    setDeleting(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('disbursements').delete().in('id', ids)
    if (error) {
      toast.error(error.message)
    } else {
      setDisbursements(prev => prev.filter(d => !selectedIds.has(d.id)))
      toast.success(`${ids.length} disbursement${ids.length > 1 ? 's' : ''} deleted`)
      logActivity({ action: `Deleted ${ids.length} disbursement(s)`, entity_type: 'disbursement', metadata: { ids } })
      setSelectedIds(new Set())
    }
    setDeleting(false)
    setDeleteStep(0)
  }

  async function bulkApprove() {
    const pendingIds = queueItems.filter(d => d.status === 'pending_approval').map(d => d.id)
    if (pendingIds.length === 0) return toast('No pending disbursements to approve')

    const { error } = await supabase.from('disbursements').update({
      status: 'approved',
      approved_by: 'ops',
      approved_at: new Date().toISOString(),
    }).in('id', pendingIds)

    if (error) { toast.error(error.message) } else {
      setDisbursements(prev => prev.map(d =>
        pendingIds.includes(d.id) ? { ...d, status: 'approved', approved_by: 'ops', approved_at: new Date().toISOString() } : d
      ))
      toast.success(`${pendingIds.length} disbursements approved`)
      logActivity({ action: `Bulk approved ${pendingIds.length} disbursements`, metadata: { ids: pendingIds } })
    }
  }

  function exportCSV() {
    const approved = disbursements.filter(d => d.status === 'approved' && d.recipient_type === 'creator')
    if (approved.length === 0) return toast.error('No approved creator disbursements to export')

    const rows = [
      ['Name', 'Amount', 'Currency', 'Deal', 'Campaign', 'Payment Method'],
      ...approved.map(d => [
        d.recipient_name,
        d.amount.toFixed(2),
        'USD',
        d.deal?.deal_id || '',
        d.deal?.campaign_name || '',
        d.payment_method || '',
      ]),
    ]

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tsp-disbursements-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${approved.length} disbursements`)
  }

  const pendingCount = queueItems.filter(d => d.status === 'pending_approval').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Disbursements</h1>
          <p className="text-[#8B91A8] text-sm">{pendingCount} pending approval</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="secondary" onClick={() => setDeleteStep(1)} className="border-[#FF4D6A]/40 text-[#FF4D6A] hover:bg-[#FF4D6A]/10">
              <Trash2 className="w-4 h-4" /> Delete {selectedIds.size} selected
            </Button>
          )}
          {availableBrands.length > 0 && (
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="bg-[#1A1D27] border border-[#2A2D3E] rounded-md px-3 py-2 text-sm text-[#F0F2F8] focus:outline-none focus:border-[#00E5FF] transition-colors"
            >
              <option value="all">All Brands</option>
              {availableBrands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <Button variant="secondary" onClick={exportCSV}><Download className="w-4 h-4" /> Export CSV</Button>
          {pendingCount > 0 && (
            <Button onClick={bulkApprove}><CheckCircle className="w-4 h-4" /> Approve All ({pendingCount})</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-1 w-fit">
        {(['queue', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              activeTab === tab
                ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                : 'text-[#8B91A8] hover:text-[#F0F2F8]'
            }`}
          >
            {tab === 'queue' ? `Payout Queue ${queueItems.length > 0 ? `(${queueItems.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {activeTab === 'queue' ? (
        groupedQueue.length === 0 ? (
          <EmptyState icon={Send} title="No pending disbursements" description="All disbursements have been sent" />
        ) : (
          <div className="space-y-4">
            {groupedQueue.map(([recipientName, items]) => {
              const total = items.reduce((s, d) => s + d.amount, 0)
              const isCreator = items[0]?.recipient_type === 'creator'

              return (
                <div key={recipientName} className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl overflow-hidden">
                  {/* Group header */}
                  <div className="px-5 py-3 bg-[#21253A] border-b border-[#2A2D3E] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isCreator ? 'bg-[#00D084]' : 'bg-[#00E5FF]'}`} />
                      <span className="font-medium text-[#F0F2F8]">{recipientName}</span>
                      <span className="text-xs text-[#5A6080] uppercase">{items[0]?.recipient_type}</span>
                    </div>
                    <span className="font-mono font-semibold text-[#F0F2F8]">{formatCurrency(total)}</span>
                  </div>

                  {/* Disbursement rows */}
                  <div className="divide-y divide-[#2A2D3E]/50">
                    {items.map((d: any) => (
                      <div key={d.id} className="px-5 py-3 flex items-center gap-3 justify-between">
                        <div
                          onClick={e => toggleSelect(d.id, e)}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-all ${
                            selectedIds.has(d.id) ? 'bg-[#00E5FF] border-[#00E5FF]' : 'border-[#3A3D50] bg-[#0F1117] hover:border-[#00E5FF]/50'
                          }`}
                        >
                          {selectedIds.has(d.id) && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="#0F1117" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-[#F0F2F8]">{formatCurrency(d.amount)}</span>
                            <StatusBadge status={d.status} />
                          </div>
                          {d.recipient_type === 'creator' && (() => {
                            const totalFee = paypalFeesByDeal[d.deal_id] || 0
                            return totalFee > 0 ? (
                              <p className="text-[10px] text-[#FF4D6A] font-mono mt-0.5">−{formatCurrency(totalFee)} PayPal fee deducted</p>
                            ) : null
                          })()}
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-[#5A6080]">
                            {d.deal && (
                              <Link href={`/deals/${d.deal_id}`} className="hover:text-[#00E5FF] transition-colors">
                                {d.deal.deal_id}
                              </Link>
                            )}
                            {d.deal?.campaign_name && <span>{d.deal.campaign_name}</span>}
                            {d.deal?.brand?.brand_name && <span>· {d.deal.brand.brand_name}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {d.status === 'pending_approval' && (
                            <Button size="sm" onClick={() => approve(d.id)} loading={loadingIds.has(d.id)}>
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </Button>
                          )}
                          {d.status === 'approved' && (
                            <Button size="sm" variant="secondary" onClick={() => markSent(d.id)} loading={loadingIds.has(d.id)}>
                              <Send className="w-3.5 h-3.5" /> Mark Sent
                            </Button>
                          )}
                          {d.approved_at && (
                            <span className="text-xs text-[#5A6080]">
                              Approved {formatDate(d.approved_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        historyItems.length === 0 ? (
          <EmptyState icon={Clock} title="No disbursement history" description="Sent disbursements will appear here" />
        ) : (
          <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2D3E]">
                  <th className="py-3 px-4 w-8" />
                  {['Recipient', 'Type', 'Amount', 'Deal', 'Status', 'Sent At'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#8B91A8] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyItems.map((d: any) => (
                  <tr key={d.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-3 px-4">
                      <div
                        onClick={e => toggleSelect(d.id, e)}
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${
                          selectedIds.has(d.id) ? 'bg-[#00E5FF] border-[#00E5FF]' : 'border-[#3A3D50] bg-[#0F1117] hover:border-[#00E5FF]/50'
                        }`}
                      >
                        {selectedIds.has(d.id) && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#0F1117" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#F0F2F8]">{d.recipient_name}</td>
                    <td className="py-3 px-4 text-xs uppercase text-[#8B91A8]">{d.recipient_type}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[#F0F2F8]">{formatCurrency(d.amount)}</span>
                      {d.recipient_type === 'creator' && (() => {
                        const totalFee = paypalFeesByDeal[d.deal_id] || 0
                        return totalFee > 0 ? (
                          <p className="text-[10px] text-[#FF4D6A] font-mono mt-0.5">−{formatCurrency(totalFee)} PayPal fee</p>
                        ) : null
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      {d.deal ? (
                        <Link href={`/deals/${d.deal_id}`} className="text-xs font-mono text-[#8B91A8] hover:text-[#00E5FF] transition-colors">
                          {d.deal.deal_id}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={d.status} /></td>
                    <td className="py-3 px-4 text-xs text-[#5A6080]">{formatDateTime(d.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Partial payment warning before marking sent */}
      <Modal open={!!pendingSend} onClose={() => setPendingSend(null)} title="Full Payment Not Yet Received" size="sm">
        {pendingSend && (() => {
          const d = disbursements.find((x: any) => x.id === pendingSend)
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FFB800]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Send className="w-4 h-4 text-[#FFB800]" />
                </div>
                <div>
                  <p className="text-sm text-[#F0F2F8]">
                    TSP has not yet collected the full brand rate for this deal.
                  </p>
                  <p className="text-sm text-[#8B91A8] mt-1">
                    Approving <span className="font-mono text-[#F0F2F8]">{formatCurrency(d?.amount)}</span> to <span className="font-semibold text-[#F0F2F8]">{d?.recipient_name}</span> before full payment is received means TSP may be paying out funds it hasn't collected yet.
                  </p>
                </div>
              </div>
              {d?.deal && (
                <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-3 text-sm">
                  <p className="text-xs text-[#5A6080] mb-1">Deal</p>
                  <p className="font-medium text-[#F0F2F8]">{d.deal.campaign_name || d.deal.deal_id}</p>
                  <p className="text-xs text-[#FFB800] mt-1">Status: {d.deal.status?.replace(/_/g, ' ')}</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" onClick={() => setPendingSend(null)}>Cancel</Button>
                <Button
                  onClick={() => { const id = pendingSend!; setPendingSend(null); approve(id, true) }}
                  className="bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40 hover:bg-[#FFB800]/30"
                >
                  Approve Anyway
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Payment method confirmation before marking sent */}
      <Modal open={!!pendingMethodConfirm} onClose={() => setPendingMethodConfirm(null)} title="Confirm Payment Method" size="sm">
        {pendingMethodConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[#8B91A8]">
              How are you sending this payment to <span className="font-semibold text-[#F0F2F8]">{pendingMethodConfirm.creatorName}</span>?
            </p>
            <div className="flex flex-wrap gap-2">
              {['wise', 'paypal', 'bank', 'check', 'venmo', 'zelle', 'ach', 'wire', 'other'].map(m => {
                const active = pendingMethodConfirm.selectedMethod === m
                const isStored = pendingMethodConfirm.creatorStoredMethod === m
                return (
                  <button
                    key={m}
                    onClick={() => setPendingMethodConfirm(p => p ? { ...p, selectedMethod: m } : p)}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors capitalize ${
                      active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/40'
                        : 'bg-[#0F1117] text-[#8B91A8] border border-[#2A2D3E] hover:text-[#F0F2F8]'
                    }`}
                  >
                    {m}{isStored ? ' ★' : ''}
                  </button>
                )
              })}
            </div>
            {pendingMethodConfirm.creatorStoredMethod && pendingMethodConfirm.selectedMethod && pendingMethodConfirm.selectedMethod !== pendingMethodConfirm.creatorStoredMethod && (
              <p className="text-xs text-[#FFB800]">
                This differs from the saved method (<span className="font-mono capitalize">{pendingMethodConfirm.creatorStoredMethod}</span>). You'll be asked to update the creator's profile after sending.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setPendingMethodConfirm(null)}>Cancel</Button>
              <Button onClick={confirmMethodAndSend} disabled={!pendingMethodConfirm.selectedMethod}>
                <Send className="w-3.5 h-3.5" /> Confirm & Send
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Creator payment method update prompt */}
      <Modal open={!!pendingCreatorMethodUpdate} onClose={() => setPendingCreatorMethodUpdate(null)} title="Update Creator Profile?" size="sm">
        {pendingCreatorMethodUpdate && (
          <div className="space-y-4">
            <p className="text-sm text-[#8B91A8]">
              You sent via <span className="font-mono text-[#00E5FF] capitalize">{pendingCreatorMethodUpdate.newMethod}</span>, but <span className="font-semibold text-[#F0F2F8]">{pendingCreatorMethodUpdate.creatorName}</span>'s profile shows <span className="font-mono text-[#8B91A8] capitalize">{pendingCreatorMethodUpdate.oldMethod || 'no method saved'}</span>.
            </p>
            <p className="text-sm text-[#8B91A8]">Update their profile to reflect this payment method?</p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setPendingCreatorMethodUpdate(null)}>Skip</Button>
              <Button loading={savingCreatorMethod} onClick={saveCreatorMethod}>Update Profile</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={deleteStep === 1} onClose={() => setDeleteStep(0)} title="Delete Disbursements?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#8B91A8]">
            You are about to delete <span className="text-[#F0F2F8] font-semibold">{selectedIds.size} disbursement{selectedIds.size > 1 ? 's' : ''}</span>. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" onClick={() => setDeleteStep(2)} className="bg-[#FF4D6A]/20 text-[#FF4D6A] border border-[#FF4D6A]/40 hover:bg-[#FF4D6A]/30">
              Yes, delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteStep === 2} onClose={() => setDeleteStep(0)} title="Final Confirmation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#F0F2F8] font-semibold">This cannot be undone.</p>
          <p className="text-sm text-[#8B91A8]">These disbursement records will be permanently deleted.</p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" loading={deleting} onClick={handleDelete} className="bg-[#FF4D6A] text-white hover:bg-[#FF4D6A]/90 border-transparent">
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
