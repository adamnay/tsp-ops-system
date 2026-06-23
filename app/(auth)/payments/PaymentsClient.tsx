'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Payment } from '@/lib/types'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CreditCard, Plus, Upload, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import Papa from 'papaparse'
import Link from 'next/link'

const SOURCE_OPTIONS = [
  { value: 'bluevine', label: 'Bluevine' },
  { value: 'wise', label: 'Wise' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank_wire', label: 'Bank Wire' },
  { value: 'other', label: 'Other' },
]

// CSV format detection and mapping
function detectAndParseCSV(rows: any[]): Array<{
  amount: number
  payment_date: string
  source: string
  sender_name: string
  memo: string
  raw_import_data: any
}> | null {
  if (!rows.length) return null
  const headers = Object.keys(rows[0]).map(h => h.trim())

  // Bluevine: Date, Description, Amount, Balance, Type
  if (headers.includes('Description') && headers.includes('Balance') && headers.includes('Type')) {
    return rows
      .filter(r => parseFloat(r.Amount) > 0)
      .map(r => ({
        amount: Math.abs(parseFloat(r.Amount)),
        payment_date: new Date(r.Date).toISOString().split('T')[0],
        source: 'bluevine',
        sender_name: r.Description?.trim() || 'Unknown',
        memo: r.Description?.trim() || '',
        raw_import_data: r,
      }))
  }

  // Wise: TransferID, Date, Amount, Currency, Description, Reference
  if (headers.includes('TransferID') || (headers.includes('Reference') && headers.includes('Currency'))) {
    return rows
      .filter(r => parseFloat(r.Amount) > 0)
      .map(r => ({
        amount: Math.abs(parseFloat(r.Amount)),
        payment_date: new Date(r.Date).toISOString().split('T')[0],
        source: 'wise',
        sender_name: r.Description?.trim() || 'Unknown',
        memo: r.Reference?.trim() || r.Description?.trim() || '',
        raw_import_data: r,
      }))
  }

  // PayPal: Date, Time, Name, Type, Status, Currency, Amount, Receipt ID, Balance
  if (headers.includes('Receipt ID') || (headers.includes('Name') && headers.includes('Type') && headers.includes('Status'))) {
    return rows
      .filter(r => parseFloat(r.Amount) > 0 && r.Status?.toLowerCase() === 'completed')
      .map(r => ({
        amount: Math.abs(parseFloat(r.Amount.replace(/,/g, ''))),
        payment_date: new Date(r.Date).toISOString().split('T')[0],
        source: 'paypal',
        sender_name: r.Name?.trim() || 'Unknown',
        memo: r['Receipt ID']?.trim() || '',
        raw_import_data: r,
      }))
  }

  return null
}

interface Props {
  initialPayments: any[]
  initialLastSynced: string | null
}

export function PaymentsClient({ initialPayments, initialLastSynced }: Props) {
  const [payments, setPayments] = useState(initialPayments)
  const [activeTab, setActiveTab] = useState<'all' | 'ignored'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(initialLastSynced)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('payments-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, payload => {
        const newPayment = payload.new as any
        setPayments(prev => {
          if (prev.find(p => p.id === newPayment.id)) return prev
          return [newPayment, ...prev]
        })
        toast.success(`New payment received: ${newPayment.sender_name} — $${newPayment.amount}`)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, payload => {
        const updated = payload.new as any
        setPayments(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function unignorePayment(id: string) {
    const { error } = await supabase.from('payments').update({ match_status: 'unmatched' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setPayments(p => p.map(x => x.id === id ? { ...x, match_status: 'unmatched' } : x))
    toast.success('Payment restored to unmatched')
  }

  async function handleDelete() {
    setDeleting(true)
    const ids = Array.from(selectedIds)
    // Remove linked disbursements first to satisfy FK constraint
    await supabase.from('disbursements').delete().in('payment_id', ids)
    const { error } = await supabase.from('payments').delete().in('id', ids)
    if (error) {
      toast.error(error.message)
    } else {
      setPayments(p => p.filter(x => !selectedIds.has(x.id)))
      toast.success(`${ids.length} payment${ids.length > 1 ? 's' : ''} deleted`)
      logActivity({ action: `Deleted ${ids.length} payment(s)`, entity_type: 'payment', metadata: { ids } })
      setSelectedIds(new Set())
    }
    setDeleting(false)
    setDeleteStep(0)
  }

  async function syncPayPal() {
    setSyncing(true)
    try {
      const res = await fetch('/api/integrations/paypal/sync', { method: 'POST' })
      const json = await res.json()
      console.log('PayPal sync full response:', JSON.stringify(json, null, 2))
      if (!res.ok) {
        toast.error(json.error || 'Sync failed')
      } else {
        setLastSynced(new Date().toISOString())
        if (json.imported === 0) {
          toast(json.message || 'No new transactions')
        } else {
          toast.success(`Synced ${json.imported} new transaction${json.imported > 1 ? 's' : ''} from PayPal`)
          router.refresh()
        }
      }
    } catch {
      toast.error('Network error')
    }
    setSyncing(false)
  }

  function formatLastSynced(iso: string | null): string {
    if (!iso) return ''
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    source: 'bluevine',
    sender_name: '',
    memo: '',
    paypal_fee: '',
  })

  function resetForm() {
    setForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], source: 'bluevine', sender_name: '', memo: '', paypal_fee: '' })
  }

  async function reconcilePayment(paymentId: string, paymentData: any) {
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, payment: paymentData }),
      })
      return await res.json()
    } catch {
      return null
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.sender_name) return toast.error('Amount and sender name are required')
    setLoading(true)

    const paypalFee = form.source === 'paypal' && form.paypal_fee ? parseFloat(form.paypal_fee) : null

    const paymentData = {
      amount: parseFloat(form.amount),
      payment_date: form.payment_date,
      source: form.source,
      sender_name: form.sender_name.trim(),
      memo: form.memo.trim() || null,
      raw_import_data: paypalFee ? { paypal_fee: paypalFee } : null,
    }

    const { data, error } = await supabase.from('payments').insert({ ...paymentData, match_status: 'unmatched' }).select('*, matched_deal:deals!payments_matched_deal_id_fkey(deal_id, campaign_name, brand:brands(brand_name))').single()

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    toast.success('Payment logged — running AI reconciliation...')
    logActivity({ action: 'Payment logged manually', entity_type: 'payment', entity_id: data.id, entity_label: `${form.sender_name} — ${formatCurrency(parseFloat(form.amount))}` })
    setPayments([data, ...payments])
    setModalOpen(false)
    resetForm()

    // Run reconciliation
    const result = await reconcilePayment(data.id, paymentData)
    if (result?.action === 'auto_confirm') {
      toast.success(`AI matched to ${result.matched_deal_id ? 'a deal' : 'no deal'} with high confidence`)
    } else if (result?.matched_deal_id) {
      toast('AI found a possible match — check the reconciliation queue', { icon: '🔍' })
    }

    setLoading(false)
    router.refresh()
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportLoading(true)
    toast('Parsing CSV...', { icon: '📄' })

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsed = detectAndParseCSV(results.data as any[])
        if (!parsed) {
          toast.error('Could not detect CSV format. Expected Bluevine, Wise, or PayPal format.')
          setImportLoading(false)
          return
        }

        const validRows = parsed.filter(r => r.amount > 0 && r.payment_date)
        if (validRows.length === 0) {
          toast.error('No valid payment rows found in CSV')
          setImportLoading(false)
          return
        }

        toast.success(`Found ${validRows.length} payments — importing and reconciling...`)
        setImportProgress({ done: 0, total: validRows.length })

        let imported = 0
        for (const row of validRows) {
          const { data, error } = await supabase.from('payments').insert({
            amount: row.amount,
            payment_date: row.payment_date,
            source: row.source,
            sender_name: row.sender_name,
            memo: row.memo || null,
            match_status: 'unmatched',
            raw_import_data: row.raw_import_data,
          }).select().single()

          if (!error && data) {
            await reconcilePayment(data.id, row)
          }

          imported++
          setImportProgress({ done: imported, total: validRows.length })
        }

        toast.success(`Import complete: ${imported} payments processed`)
        setImportProgress(null)
        setImportLoading(false)
        router.refresh()
      },
      error: () => {
        toast.error('Failed to parse CSV file')
        setImportLoading(false)
      },
    })

    // Reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  const displayPayments = activeTab === 'ignored'
    ? payments.filter(p => p.match_status === 'ignored')
    : payments.filter(p => p.match_status !== 'ignored')

  const ignoredCount = payments.filter(p => p.match_status === 'ignored').length

  const columns = [
    {
      key: 'select',
      header: '',
      render: (row: any) => {
        const checked = selectedIds.has(row.id)
        return (
          <div
            onClick={e => toggleSelect(row.id, e)}
            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all shrink-0 ${
              checked ? 'bg-[#00E5FF] border-[#00E5FF]' : 'border-[#3A3D50] bg-[#0F1117] hover:border-[#00E5FF]/50'
            }`}
          >
            {checked && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="#0F1117" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )
      },
    },
    { key: 'payment_date', header: 'Date', render: (row: any) => <span className="text-xs text-[#5A6080] font-mono">{formatDate(row.payment_date)}</span> },
    {
      key: 'sender_name', header: 'Sender',
      render: (row: any) => <span className="text-[#F0F2F8] font-medium">{row.sender_name}</span>,
    },
    {
      key: 'amount', header: 'Amount',
      render: (row: any) => {
        const fee = row.raw_import_data?.paypal_fee
        return (
          <div>
            <span className="font-mono text-[#F0F2F8] font-semibold">{formatCurrency(row.amount)}</span>
            {fee ? <p className="text-[10px] text-[#FF4D6A] font-mono">-{formatCurrency(fee)} fee</p> : null}
          </div>
        )
      }
    },
    { key: 'source', header: 'Source', render: (row: any) => <span className="text-xs uppercase text-[#8B91A8]">{row.source}</span> },
    { key: 'memo', header: 'Memo', render: (row: any) => <span className="text-xs text-[#5A6080] max-w-[160px] truncate block">{row.memo || '—'}</span> },
    { key: 'match_status', header: 'Status', render: (row: any) => <StatusBadge status={row.match_status} /> },
    {
      key: 'ai_match_confidence', header: 'AI Confidence',
      render: (row: any) => row.ai_match_confidence ? <StatusBadge status={row.ai_match_confidence} /> : <span className="text-[#5A6080]">—</span>,
    },
    {
      key: 'matched_deal', header: 'Matched Deal',
      render: (row: any) => row.matched_deal ? (
        <Link href={`/deals/${row.matched_deal_id}`} className="text-xs text-[#00E5FF] hover:underline font-mono">
          {row.matched_deal.deal_id}
        </Link>
      ) : (
        row.ai_suggested_deal_id ? <span className="text-xs text-[#FFB800]">AI suggested</span> : <span className="text-[#5A6080]">—</span>
      ),
    },
    ...(activeTab === 'ignored' ? [{
      key: 'unignore',
      header: '',
      render: (row: any) => (
        <button
          onClick={e => { e.stopPropagation(); unignorePayment(row.id) }}
          className="text-xs text-[#8B91A8] hover:text-[#00E5FF] border border-[#2A2D3E] hover:border-[#00E5FF]/40 px-2 py-1 rounded transition-colors"
        >
          Restore
        </button>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Payments</h1>
          <p className="text-[#8B91A8] text-sm">{payments.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
          <div className="flex flex-col items-end gap-0.5">
            <Button variant="secondary" onClick={syncPayPal} loading={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sync PayPal
            </Button>
            {lastSynced && (
              <span className="text-[10px] text-[#5A6080]">Synced {formatLastSynced(lastSynced)}</span>
            )}
          </div>
          <Button variant="secondary" onClick={() => downloadCSV(payments.map((p: any) => ({ 'Date': p.payment_date, 'Sender': p.sender_name || '', 'Amount': p.amount, 'Source': p.source || '', 'Status': p.match_status, 'Matched Deal': p.matched_deal?.deal_id || '', 'Campaign': p.matched_deal?.campaign_name || '', 'Brand': p.matched_deal?.brand?.brand_name || '', 'Memo': p.memo || '' })), 'payments')}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="secondary" onClick={() => setDeleteStep(1)} className="border-[#FF4D6A]/40 text-[#FF4D6A] hover:bg-[#FF4D6A]/10">
              Delete {selectedIds.size} selected
            </Button>
          )}
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={importLoading}>
            <Upload className="w-4 h-4" />
            {importLoading && importProgress ? `${importProgress.done}/${importProgress.total}` : 'Import CSV'}
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Add Payment
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-1 w-fit">
        {(['all', 'ignored'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              activeTab === tab
                ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                : 'text-[#8B91A8] hover:text-[#F0F2F8]'
            }`}
          >
            {tab === 'all' ? 'All Payments' : `Ignored${ignoredCount > 0 ? ` (${ignoredCount})` : ''}`}
          </button>
        ))}
      </div>

      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
        <DataTable
          columns={columns}
          data={displayPayments}
          emptyState={
            <EmptyState
              icon={activeTab === 'ignored' ? AlertCircle : CreditCard}
              title={activeTab === 'ignored' ? 'No ignored payments' : 'No payments yet'}
              description={activeTab === 'ignored' ? 'Payments you ignore will appear here' : 'Add a payment manually or import a CSV'}
              action={activeTab === 'all' ? <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Add Payment</Button> : undefined}
            />
          }
        />
      </div>

      {/* Delete confirmation step 1 */}
      <Modal open={deleteStep === 1} onClose={() => setDeleteStep(0)} title="Delete Payments?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#8B91A8]">
            You are about to delete <span className="text-[#F0F2F8] font-semibold">{selectedIds.size} payment{selectedIds.size > 1 ? 's' : ''}</span>. This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" onClick={() => setDeleteStep(2)} className="bg-[#FF4D6A]/20 text-[#FF4D6A] border border-[#FF4D6A]/40 hover:bg-[#FF4D6A]/30">
              Yes, delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation step 2 */}
      <Modal open={deleteStep === 2} onClose={() => setDeleteStep(0)} title="Final Confirmation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#F0F2F8] font-semibold">This cannot be undone.</p>
          <p className="text-sm text-[#8B91A8]">These payments and any AI match suggestions will be permanently deleted.</p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" loading={deleting} onClick={handleDelete} className="bg-[#FF4D6A] text-white hover:bg-[#FF4D6A]/90 border-transparent">
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manual entry modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title="Log Payment" size="md">
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount ($) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000.00" />
            <Input label="Payment Date *" type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>
          <Select label="Source *" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value, paypal_fee: '' }))} options={SOURCE_OPTIONS} />
          <Input label="Sender Name *" value={form.sender_name} onChange={e => setForm(f => ({ ...f, sender_name: e.target.value }))} placeholder="Exactly as it appeared" />
          <Input label="Memo / Reference" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="Reference field from bank" />
          {form.source === 'paypal' && (
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-3 space-y-2">
              <p className="text-xs text-[#8B91A8]">Did PayPal take a fee on this payment?</p>
              <Input
                label="PayPal Fee ($) — leave blank if none"
                type="number"
                min="0"
                step="0.01"
                value={form.paypal_fee}
                onChange={e => setForm(f => ({ ...f, paypal_fee: e.target.value }))}
                placeholder="e.g. 1.75"
              />
              {form.paypal_fee && parseFloat(form.paypal_fee) > 0 && form.amount && (
                <p className="text-xs text-[#5A6080]">
                  Creator payout will be reduced by <span className="text-[#FF4D6A]">{formatCurrency(parseFloat(form.paypal_fee))}</span> at reconciliation
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-[#5A6080]">AI reconciliation will run automatically after saving.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); resetForm() }}>Cancel</Button>
            <Button type="submit" loading={loading}>Log Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
