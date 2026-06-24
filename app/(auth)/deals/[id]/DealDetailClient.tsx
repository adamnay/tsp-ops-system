'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Copy, Upload, FileCheck, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'payment_pending', label: 'Payment Pending' },
  { value: 'partial_payment_received', label: 'Partial Payment Received' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'escrowed', label: 'Escrowed' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'closed', label: 'Closed' },
]

interface Props {
  deal: any
  payments: any[]
  disbursements: any[]
  allocations: any[]
}

export function DealDetailClient({ deal: initialDeal, payments, disbursements, allocations }: Props) {
  const [deal, setDeal] = useState(initialDeal)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(() => {
    const d = new Date(initialDeal.created_at)
    return d.toISOString().slice(0, 16) // 'YYYY-MM-DDTHH:mm'
  })
  const supabase = createClient()
  const router = useRouter()

  async function saveCreatedAt() {
    const iso = new Date(dateValue).toISOString()
    const { data, error } = await supabase.from('deals').update({ created_at: iso }).eq('id', deal.id).select('*, brand:brands(*), creator:creators(*)').single()
    if (error) { toast.error(error.message); return }
    setDeal(data)
    setEditingDate(false)
    toast.success('Date updated')
    logActivity({ action: 'Deal date edited', entity_type: 'deal', entity_id: deal.id, entity_label: deal.deal_id })
  }

  function sanitizeFileName(name: string): string {
    const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
    const base = name.slice(0, name.length - ext.length)
    return base.replace(/[^a-zA-Z0-9_-]/g, '_') + ext
  }

  async function handleContractUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingContract(true)
    const path = `${deal.deal_id}/${sanitizeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { upsert: true })
    if (uploadError) { toast.error(uploadError.message); setUploadingContract(false); return }
    const { data, error } = await supabase.from('deals').update({ contract_file_path: path }).eq('id', deal.id).select('*, brand:brands(*), creator:creators(*)').single()
    if (error) { toast.error(error.message) } else {
      setDeal(data)
      toast.success('Contract uploaded')
      logActivity({ action: 'Contract uploaded', entity_type: 'deal', entity_id: deal.id, entity_label: deal.deal_id })
      toast('Syncing to Drive…')
      fetch('/api/integrations/gdrive/upload-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path, fileName: file.name }),
      }).then(async r => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) toast.error(`Drive sync failed: ${json.error || r.status}`)
        else toast.success('Backed up to Google Drive')
      }).catch(err => toast.error(`Drive sync error: ${err.message}`))
    }
    setUploadingContract(false)
    if (e.target) e.target.value = ''
  }

  async function downloadContract() {
    if (!deal.contract_file_path) return
    const { data, error } = await supabase.storage.from('contracts').createSignedUrl(deal.contract_file_path, 60)
    if (error || !data) { toast.error('Could not generate download link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function updateStatus(status: string) {
    setUpdatingStatus(true)
    const { data, error } = await supabase.from('deals').update({ status }).eq('id', deal.id).select('*, brand:brands(*), creator:creators(*)').single()
    if (error) { toast.error(error.message) } else {
      setDeal(data)
      toast.success('Status updated')
      logActivity({ action: `Deal status changed to ${status}`, entity_type: 'deal', entity_id: deal.id, entity_label: deal.deal_id, metadata: { prev_status: deal.status, new_status: status } })
      router.refresh()
    }
    setUpdatingStatus(false)
  }

  function copyRef() {
    navigator.clipboard.writeText(deal.payment_reference || '')
    toast.success('Payment reference copied')
  }

  const totalFromDirect = payments.reduce((s: number, p: any) => s + p.amount, 0)
  const totalFromAllocations = allocations.reduce((s: number, a: any) => s + a.allocated_amount, 0)
  const totalReceived = totalFromDirect + totalFromAllocations
  const totalDisbursed = disbursements.filter((d: any) => ['sent', 'confirmed'].includes(d.status)).reduce((s: number, d: any) => s + d.amount, 0)
  const totalPaypalFees =
    payments.reduce((s: number, p: any) => s + Math.abs(parseFloat(p.raw_import_data?.paypal_fee || '0') || 0), 0) +
    allocations.reduce((s: number, a: any) => s + (a.paypal_fee || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals" className="text-[#8B91A8] hover:text-[#F0F2F8] transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[#F0F2F8]">{deal.campaign_name}</h1>
            <StatusBadge status={deal.status} />
          </div>
          <p className="font-mono text-xs text-[#5A6080] mt-0.5">{deal.deal_id}</p>
        </div>
        <div className="w-44">
          <Select value={deal.status} onChange={e => updateStatus(e.target.value)} options={STATUS_OPTIONS} />
        </div>
      </div>

      {/* Money breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-[#5A6080] mb-1">Brand Rate</p>
          <p className="font-mono text-xl font-semibold text-[#F0F2F8]">{formatCurrency(deal.brand_rate)}</p>
          <p className="text-xs text-[#5A6080] mt-1">What brand pays</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5A6080] mb-1">Creator Rate</p>
          <p className="font-mono text-xl font-semibold text-[#8B91A8]">{formatCurrency(deal.creator_rate)}</p>
          <p className="text-xs text-[#5A6080] mt-1">Creator-facing value</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5A6080] mb-1">TSP Total</p>
          <p className="font-mono text-xl font-semibold text-[#00E5FF]">{formatCurrency(deal.tsp_total)}</p>
          <p className="text-xs text-[#5A6080] mt-1">Margin {formatCurrency(deal.tsp_margin)} + {deal.tsp_commission_pct}%</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5A6080] mb-1">Creator Payout</p>
          <p className="font-mono text-xl font-semibold text-[#00D084]">{formatCurrency(deal.creator_payout)}</p>
          {totalPaypalFees > 0 ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-[#FF4D6A]">−{formatCurrency(totalPaypalFees)} PayPal fee</p>
              <p className="text-xs font-mono font-semibold text-[#00D084]">= {formatCurrency(deal.creator_payout - totalPaypalFees)} net</p>
            </div>
          ) : (
            <p className="text-xs text-[#5A6080] mt-1">{100 - deal.tsp_commission_pct}% of creator rate</p>
          )}
        </Card>
      </div>

      {/* Deal details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Deal Info</CardTitle></CardHeader>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#8B91A8]">Brand</dt>
              <dd className="text-[#F0F2F8]">
                <Link href={`/brands/${deal.brand_id}`} className="hover:text-[#00E5FF] transition-colors">{deal.brand?.brand_name}</Link>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8B91A8]">Creator</dt>
              <dd className="text-[#F0F2F8]">
                <Link href={`/creators/${deal.creator_id}`} className="hover:text-[#00E5FF] transition-colors">{deal.creator?.stage_name || deal.creator?.legal_name}</Link>
              </dd>
            </div>
            <div className="flex justify-between items-start">
              <dt className="text-[#8B91A8] shrink-0">Created</dt>
              <dd className="text-right">
                {editingDate ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={dateValue}
                      onChange={e => setDateValue(e.target.value)}
                      className="bg-[#0F1117] border border-[#2A2D3E] rounded px-2 py-1 text-xs text-[#F0F2F8] focus:outline-none focus:border-[#00E5FF]"
                    />
                    <button onClick={saveCreatedAt} className="text-xs text-[#00E5FF] hover:underline">Save</button>
                    <button onClick={() => setEditingDate(false)} className="text-xs text-[#5A6080] hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setEditingDate(true)} className="text-xs text-[#F0F2F8] hover:text-[#00E5FF] transition-colors text-right">
                    {new Date(deal.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </button>
                )}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-[#8B91A8]">Payment Reference</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#00E5FF]">{deal.payment_reference || '—'}</span>
                {deal.payment_reference && (
                  <button onClick={copyRef} className="text-[#5A6080] hover:text-[#F0F2F8] transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#8B91A8]">Total Received</dt>
              <dd className="font-mono text-[#F0F2F8]">{formatCurrency(totalReceived)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8B91A8]">Still Owed by Brand</dt>
              <dd className={`font-mono ${deal.brand_rate - totalReceived > 0 ? 'text-[#FFB800]' : 'text-[#00D084]'}`}>
                {formatCurrency(Math.max(0, deal.brand_rate - totalReceived))}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[#2A2D3E] pt-3">
              <dt className="text-[#8B91A8]">Total Disbursed</dt>
              <dd className="font-mono text-[#F0F2F8]">{formatCurrency(totalDisbursed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8B91A8]">In Escrow</dt>
              <dd className="font-mono font-semibold text-[#00E5FF]">{formatCurrency(Math.max(0, totalReceived - totalDisbursed))}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Contract */}
      <Card>
        <CardHeader><CardTitle>Contract</CardTitle></CardHeader>
        {deal.contract_file_path ? (
          <div className="flex items-center gap-3">
            <FileCheck className="w-5 h-5 text-[#00D084] shrink-0" />
            <span className="text-sm text-[#F0F2F8] flex-1 truncate">{deal.contract_file_path.split('/').pop()}</span>
            <button onClick={downloadContract} className="flex items-center gap-1.5 text-xs text-[#00E5FF] hover:underline">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <label className="flex items-center gap-1.5 text-xs text-[#8B91A8] hover:text-[#F0F2F8] cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" /> Replace
              <input type="file" className="hidden" onChange={handleContractUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
            </label>
          </div>
        ) : (
          <label className={`flex flex-col items-center gap-2 border-2 border-dashed border-[#2A2D3E] rounded-lg py-6 cursor-pointer hover:border-[#00E5FF]/40 transition-colors ${uploadingContract ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-6 h-6 text-[#5A6080]" />
            <span className="text-sm text-[#8B91A8]">{uploadingContract ? 'Uploading…' : 'Click to upload contract'}</span>
            <span className="text-xs text-[#5A6080]">PDF, Word, or image</span>
            <input type="file" className="hidden" onChange={handleContractUpload} accept=".pdf,.doc,.docx,.png,.jpg" disabled={uploadingContract} />
          </label>
        )}
      </Card>

      {/* Payments */}
      <div>
        <h2 className="text-sm font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Linked Payments</h2>
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
          {payments.length === 0 && allocations.length === 0 ? (
            <p className="px-5 py-6 text-center text-[#5A6080] text-sm">No payments matched to this deal yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#2A2D3E]">
                {['Date', 'Sender', 'Amount', 'Source', 'Status'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#8B91A8] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-3 px-4 text-xs text-[#5A6080]">{formatDate(p.payment_date)}</td>
                    <td className="py-3 px-4 text-[#F0F2F8]">{p.sender_name}</td>
                    <td className="py-3 px-4 font-mono text-[#F0F2F8]">{formatCurrency(p.amount)}</td>
                    <td className="py-3 px-4 text-[#8B91A8] capitalize">{p.source}</td>
                    <td className="py-3 px-4"><StatusBadge status={p.match_status} /></td>
                  </tr>
                ))}
                {allocations.map((a: any) => (
                  <tr key={a.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-3 px-4 text-xs text-[#5A6080]">{formatDate(a.payment?.payment_date)}</td>
                    <td className="py-3 px-4 text-[#F0F2F8]">
                      {a.payment?.sender_name}
                      <span className="ml-1.5 text-[10px] text-[#8B91A8] bg-[#2A2D3E] px-1.5 py-0.5 rounded">split</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[#F0F2F8]">{formatCurrency(a.allocated_amount)}</span>
                      <p className="text-[10px] text-[#5A6080] font-mono mt-0.5">of {formatCurrency(a.payment?.amount)} total</p>
                    </td>
                    <td className="py-3 px-4 text-[#8B91A8] capitalize">{a.payment?.source}</td>
                    <td className="py-3 px-4"><StatusBadge status="confirmed" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Disbursements */}
      <div>
        <h2 className="text-sm font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Disbursements</h2>
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
          {disbursements.length === 0 ? (
            <p className="px-5 py-6 text-center text-[#5A6080] text-sm">No disbursements yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#2A2D3E]">
                {['Recipient', 'Type', 'Amount', 'Method', 'Status'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#8B91A8] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {disbursements.map((d: any) => (
                  <tr key={d.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-3 px-4 text-[#F0F2F8]">{d.recipient_name}</td>
                    <td className="py-3 px-4"><span className="text-xs uppercase text-[#8B91A8]">{d.recipient_type}</span></td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[#F0F2F8]">{formatCurrency(d.amount)}</span>
                      {d.recipient_type === 'creator' && totalPaypalFees > 0 && (
                        <p className="text-[10px] text-[#FF4D6A] font-mono mt-0.5">−{formatCurrency(totalPaypalFees)} PayPal fee</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#8B91A8] capitalize">{d.payment_method || '—'}</td>
                    <td className="py-3 px-4"><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {deal.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <p className="text-sm text-[#8B91A8]">{deal.notes}</p>
        </Card>
      )}
    </div>
  )
}
