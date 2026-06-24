'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Deal } from '@/lib/types'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { MonthYearSelect } from '@/components/ui/MonthYearSelect'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency, formatDate, generateDealId, generatePaymentReference } from '@/lib/utils'
import { FileText, Plus, Upload, FileCheck, Download } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import { SearchBar } from '@/components/ui/SearchBar'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import Link from 'next/link'

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
  initialDeals: any[]
  brands: { id: string; brand_name: string }[]
  creators: { id: string; legal_name: string; stage_name: string | null; default_commission_pct: number }[]
}

export function DealsClient({ initialDeals, brands, creators }: Props) {
  const [deals, setDeals] = useState(initialDeals)
  const [activeTab, setActiveTab] = useState<'deals' | 'future'>('deals')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleting, setDeleting] = useState(false)
  const [moveToOpen, setMoveToOpen] = useState(false)
  const [moveToOpenMain, setMoveToOpenMain] = useState(false)
  const [moving, setMoving] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  async function handleDrop(sectionDeals: any[], targetRow: any) {
    if (!dragId || dragId === targetRow.id) { setDragId(null); setDragOverId(null); return }
    const ordered = [...sectionDeals].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const fromIdx = ordered.findIndex(d => d.id === dragId)
    const toIdx = ordered.findIndex(d => d.id === targetRow.id)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return }
    const reordered = [...ordered]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updates = reordered.map((d, i) => ({ id: d.id, sort_order: i }))
    setDeals(prev => prev.map(d => {
      const u = updates.find(u => u.id === d.id)
      return u ? { ...d, sort_order: u.sort_order } : d
    }))
    setDragId(null)
    setDragOverId(null)
    for (const u of updates) {
      await supabase.from('deals').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
  }
  const router = useRouter()
  const supabase = createClient()

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const MOVE_TO_OPTIONS = [
    { label: 'Pending', status: 'draft' },
    { label: 'Active', status: 'active' },
    { label: 'Finished — Needs Payment', status: 'payment_pending' },
    { label: 'Partial Payment Received', status: 'partial_payment_received' },
    { label: 'Completed & Paid', status: 'closed' },
  ]

  async function handleMoveStatus(status: string) {
    setMoving(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('deals').update({ status }).in('id', ids)
    if (error) {
      toast.error(error.message)
    } else {
      setDeals(d => d.map(x => selectedIds.has(x.id) ? { ...x, status } : x))
      const label = MOVE_TO_OPTIONS.find(o => o.status === status)?.label ?? status
      const movedDeals = deals.filter(d => selectedIds.has(d.id))
      toast.success(`${ids.length} deal${ids.length > 1 ? 's' : ''} moved to ${label}`)
      for (const d of movedDeals) {
        logActivity({ action: `Moved to ${label}`, entity_type: 'deal', entity_id: d.id, entity_label: d.deal_id, metadata: { prev_status: d.status, new_status: status, prev_is_future: d.is_future } })
      }
      setSelectedIds(new Set())
    }
    setMoving(false)
  }

  async function handleMoveTo(status: string) {
    setMoving(true)
    setMoveToOpen(false)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('deals').update({ is_future: false, status }).in('id', ids)
    if (error) {
      toast.error(error.message)
    } else {
      setDeals(d => d.map(x => selectedIds.has(x.id) ? { ...x, is_future: false, status } : x))
      const label = MOVE_TO_OPTIONS.find(o => o.status === status)?.label ?? status
      const movedDeals = deals.filter(d => selectedIds.has(d.id))
      toast.success(`${ids.length} deal${ids.length > 1 ? 's' : ''} moved to ${label}`)
      for (const d of movedDeals) {
        logActivity({ action: `Moved from Future to ${label}`, entity_type: 'deal', entity_id: d.id, entity_label: d.deal_id, metadata: { prev_status: d.status, new_status: status, prev_is_future: true } })
      }
      setSelectedIds(new Set())
    }
    setMoving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    const ids = Array.from(selectedIds)
    // Clear FK references before deleting
    await supabase.from('payments').update({ matched_deal_id: null, ai_suggested_deal_id: null }).in('matched_deal_id', ids)
    await supabase.from('payments').update({ ai_suggested_deal_id: null }).in('ai_suggested_deal_id', ids)
    await supabase.from('disbursements').delete().in('deal_id', ids)
    const { error } = await supabase.from('deals').delete().in('id', ids)
    if (error) {
      toast.error(error.message)
    } else {
      setDeals(d => d.filter(x => !selectedIds.has(x.id)))
      toast.success(`${ids.length} deal${ids.length > 1 ? 's' : ''} deleted`)
      logActivity({ action: `Deleted ${ids.length} deal(s)`, entity_type: 'deal', metadata: { ids } })
      setSelectedIds(new Set())
    }
    setDeleting(false)
    setDeleteStep(0)
  }

  const [form, setForm] = useState({
    brand_id: '',
    creator_id: '',
    brand_rate: '',
    creator_rate: '',
    tsp_commission_pct: '30',
    rate_type: 'per_month',
    group: 'pending',
    campaign_start_month: '',
    campaign_months: '1',
    notes: '',
  })

  const GROUP_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'needs_payment', label: 'Finished — Needs Payment' },
    { value: 'completed', label: 'Completed & Paid' },
  ]

  const GROUP_STATUS_MAP: Record<string, string> = {
    pending: 'draft',
    active: 'active',
    needs_payment: 'payment_pending',
    completed: 'payment_received',
  }

  const selectedCreator = creators.find(c => c.id === form.creator_id)

  function handleCreatorChange(id: string) {
    const creator = creators.find(c => c.id === id)
    setForm(f => ({
      ...f,
      creator_id: id,
      tsp_commission_pct: String(creator?.default_commission_pct ?? 30),
    }))
  }

  function resetForm() {
    setForm({ brand_id: '', creator_id: '', brand_rate: '', creator_rate: '', tsp_commission_pct: '30', rate_type: 'per_month', group: 'pending', campaign_start_month: '', campaign_months: '1', notes: '' })
    setContractFile(null)
  }

  // Live computed preview
  const brandRate = parseFloat(form.brand_rate) || 0
  const creatorRate = parseFloat(form.creator_rate) || 0
  const commPct = parseFloat(form.tsp_commission_pct) || 30
  const totalMonths = parseInt(form.campaign_months) || 1
  const isTotal = form.rate_type === 'total'
  const perMonthBrandRate = isTotal ? brandRate / totalMonths : brandRate
  const perMonthCreatorRate = isTotal ? creatorRate / totalMonths : creatorRate
  const tspMargin = perMonthBrandRate - perMonthCreatorRate
  const tspCommission = perMonthCreatorRate * commPct / 100
  const tspTotal = tspMargin + tspCommission
  const creatorPayout = perMonthCreatorRate * (1 - commPct / 100)

  function addMonthsToDate(dateStr: string, months: number): string {
    const [y, m] = dateStr.split('-').map(Number)
    const d = new Date(y, m - 1 + months, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function monthLabel(monthStr: string): string {
    if (!monthStr) return ''
    const [y, m] = monthStr.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.brand_id || !form.creator_id) return toast.error('Brand and creator are required')
    if (!form.brand_rate || !form.creator_rate) return toast.error('Rates are required')
    if (parseFloat(form.creator_rate) > parseFloat(form.brand_rate)) return toast.error('Creator rate cannot exceed brand rate')
    if (!form.campaign_start_month) return toast.error('Campaign start month is required')

    const brand = brands.find(b => b.id === form.brand_id)
    const creator = creators.find(c => c.id === form.creator_id)
    if (!brand || !creator) return

    const months = Math.max(1, parseInt(form.campaign_months) || 1)
    const groupId = months > 1 ? crypto.randomUUID() : null

    setLoading(true)

    // Unique suffix per campaign so same brand+creator can have multiple deals
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
    const baseWithoutMonth = generateDealId(brand.brand_name, creator.stage_name || creator.legal_name) + `-${rand}`

    const newDeals: any[] = []
    for (let i = 0; i < months; i++) {
      const monthStr = addMonthsToDate(form.campaign_start_month, i)
      const monthName = monthLabel(monthStr)
      const [my, mm] = monthStr.split('-').map(Number)
      const monthAbbr = new Date(my, mm - 1, 1).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
      // Insert month after year: TSP-2026-JUN-BRAND-CREATOR-RAND
      const withMonth = baseWithoutMonth.replace(/^(TSP-\d{4}-)/, `$1${monthAbbr}-`)
      const dealId = withMonth + (months > 1 ? `-M${i + 1}` : '')
      const paymentRef = generatePaymentReference(dealId)

      const autoName = `${brand.brand_name} × ${creator.stage_name || creator.legal_name}`
      const { data, error } = await supabase.from('deals').insert({
        deal_id: dealId,
        brand_id: form.brand_id,
        creator_id: form.creator_id,
        campaign_name: autoName,
        brand_rate: form.rate_type === 'total' ? parseFloat(form.brand_rate) / months : parseFloat(form.brand_rate),
        creator_rate: form.rate_type === 'total' ? parseFloat(form.creator_rate) / months : parseFloat(form.creator_rate),
        tsp_commission_pct: parseFloat(form.tsp_commission_pct),
        status: months > 1 ? (i === 0 ? 'active' : 'draft') : (GROUP_STATUS_MAP[form.group] ?? 'active'),
        payment_reference: paymentRef,
        campaign_months: months,
        campaign_month_number: i + 1,
        campaign_start_month: monthStr + '-01',
        campaign_group_id: groupId,
        is_future: i >= 2,
        sort_order: i,
        notes: form.notes || null,
      }).select('*, brand:brands(brand_name), creator:creators(legal_name, stage_name)').single()

      if (error) { toast.error(`Month ${i + 1}: ${error.message}`); break }
      if (data) newDeals.push(data)
    }

    if (newDeals.length > 0) {
      // Parent folder name for multi-month campaigns (computed first so contract upload can use it)
      const parentFolderName = months > 1
        ? newDeals[0].deal_id.replace(/-M\d+$/, '') + newDeals.map((_, idx) => `-M${idx + 1}`).join('')
        : null

      // Upload contract to Supabase storage (linked to all deals in this campaign)
      if (contractFile) {
        const primaryDealId = newDeals[0].deal_id
        const ext = contractFile.name.includes('.') ? '.' + contractFile.name.split('.').pop() : ''
        const base = contractFile.name.slice(0, contractFile.name.length - ext.length)
        const safeName = base.replace(/[^a-zA-Z0-9_-]/g, '_') + ext
        const path = `${primaryDealId}/${safeName}`
        const { error: uploadError } = await supabase.storage.from('contracts').upload(path, contractFile, { upsert: true })
        if (uploadError) {
          toast.error(`Contract upload failed: ${uploadError.message}`)
        } else {
          await supabase.from('deals').update({ contract_file_path: path }).in('id', newDeals.map(d => d.id))
          newDeals.forEach(d => { d.contract_file_path = path })
          toast.success('Contract uploaded')
          logActivity({ action: 'Contract uploaded', entity_type: 'deal', entity_id: newDeals[0].id, entity_label: primaryDealId })
        }
      }

      setDeals([...newDeals, ...deals])
      toast.success(months > 1 ? `${months} monthly deals created` : `Deal created`)

      // Sync deals to Drive — await M1 first to get the parent folder ID,
      // then pass it directly to M2+ so they don't race to create the same folder.
      const buildDriveForm = (d: any, pfId?: string) => {
        const driveForm = new FormData()
        driveForm.append('deal', JSON.stringify(d))
        if (contractFile) {
          driveForm.append('contractFile', contractFile)
          driveForm.append('contractFileName', contractFile.name)
        }
        if (pfId) driveForm.append('parentFolderId', pfId)
        else if (parentFolderName) driveForm.append('parentFolderName', parentFolderName)
        return driveForm
      }

      if (newDeals.length > 0) {
        const m1Res = await fetch('/api/integrations/gdrive/sync-deal', { method: 'POST', body: buildDriveForm(newDeals[0]) })
        const m1Json = await m1Res.json().catch(() => ({}))
        const resolvedParentId: string | undefined = m1Json.containerFolderId

        newDeals.slice(1).forEach((d) => {
          fetch('/api/integrations/gdrive/sync-deal', { method: 'POST', body: buildDriveForm(d, resolvedParentId) }).catch(() => {})
        })
      }
      if (months > 1) {
        logActivity({ action: `${months}-month deal created`, entity_type: 'deal', entity_id: newDeals[0].id, entity_label: `${brand.brand_name} × ${creator.stage_name || creator.legal_name}` })
      } else {
        logActivity({ action: 'Deal created', entity_type: 'deal', entity_id: newDeals[0].id, entity_label: `${brand.brand_name} × ${creator.stage_name || creator.legal_name}` })
      }
      setModalOpen(false)
      resetForm()
    }
    setLoading(false)
  }

  const brandOptions = brands.map(b => ({ value: b.id, label: b.brand_name }))
  const creatorOptions = creators.map(c => ({ value: c.id, label: c.stage_name ? `${c.legal_name} (@${c.stage_name})` : c.legal_name }))

  const q = search.toLowerCase()
  const filteredDeals = q
    ? deals.filter(d =>
        d.deal_id?.toLowerCase().includes(q) ||
        d.brand?.brand_name?.toLowerCase().includes(q) ||
        d.creator?.legal_name?.toLowerCase().includes(q) ||
        d.creator?.stage_name?.toLowerCase().includes(q)
      )
    : deals
  const activeDeals = filteredDeals.filter(d => !d.is_future)
  const futureDeals = filteredDeals.filter(d => d.is_future)

  const SECTIONS = [
    {
      label: 'Pending',
      statuses: ['draft'],
      accent: '#5A6080',
      empty: 'No pending deals',
    },
    {
      label: 'Active',
      statuses: ['active'],
      accent: '#00D084',
      empty: 'No active deals',
    },
    {
      label: 'Finished — Needs Payment',
      statuses: ['payment_pending', 'partial_payment_received', 'payment_received', 'escrowed'],
      accent: '#FFB800',
      empty: 'No deals waiting on payment',
    },
    {
      label: 'Completed & Paid',
      statuses: ['disbursed', 'closed'],
      accent: '#8B91A8',
      empty: 'No completed deals yet',
    },
  ]

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
              checked
                ? 'bg-[#00E5FF] border-[#00E5FF]'
                : 'border-[#3A3D50] bg-[#0F1117] hover:border-[#00E5FF]/50'
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
    {
      key: 'deal_id', header: 'Deal ID',
      render: (row: any) => (
        <Link href={`/deals/${row.id}`} className="font-mono text-xs text-[#8B91A8] hover:text-[#00E5FF] transition-colors">{row.deal_id}</Link>
      ),
    },
    {
      key: 'campaign_name', header: 'Deal',
      render: (row: any) => (
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/deals/${row.id}`} className="text-[#F0F2F8] hover:text-[#00E5FF] font-medium transition-colors">
              {row.brand?.brand_name} × {row.creator?.stage_name || row.creator?.legal_name}
            </Link>
            {row.campaign_months > 1 && (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#00E5FF]/10 text-[#00E5FF]">
                {row.campaign_month_number}/{row.campaign_months}
              </span>
            )}
          </div>
          {row.campaign_start_month && (
            <p className="text-xs text-[#5A6080]">
              {new Date(row.campaign_start_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      ),
    },
    { key: 'brand_rate', header: 'Brand Rate', render: (row: any) => <span className="font-mono text-[#F0F2F8]">{formatCurrency(row.brand_rate)}</span> },
    { key: 'creator_rate', header: 'Creator Rate', render: (row: any) => <span className="font-mono text-[#8B91A8]">{formatCurrency(row.creator_rate)}</span> },
    { key: 'tsp_total', header: 'TSP Total', render: (row: any) => <span className="font-mono text-[#00E5FF]">{formatCurrency(row.tsp_total)}</span> },
    { key: 'creator_payout', header: 'Creator Gets', render: (row: any) => <span className="font-mono text-[#00D084]">{formatCurrency(row.creator_payout)}</span> },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    {
      key: 'created_at', header: 'Created',
      render: (row: any) => (
        <span className="text-xs text-[#5A6080] font-mono whitespace-nowrap">
          {new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Deals</h1>
          <p className="text-[#8B91A8] text-sm">{deals.length} deals</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search deals…" />
          <Button variant="secondary" onClick={() => downloadCSV(deals.map((d: any) => ({ 'Deal ID': d.deal_id, 'Campaign': d.campaign_name, 'Brand': d.brand?.brand_name || '', 'Creator': d.creator?.stage_name || d.creator?.legal_name || '', 'Brand Rate': d.brand_rate, 'Creator Rate': d.creator_rate, 'TSP Total': d.tsp_total, 'Creator Payout': d.creator_payout, 'Status': d.status, 'Future': d.is_future ? 'Yes' : 'No', 'Created': d.created_at?.slice(0, 10) || '' })), 'deals')}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          {selectedIds.size > 0 && (
            <>
              <div className="relative">
                <Button variant="secondary" onClick={() => { activeTab === 'future' ? setMoveToOpen(o => !o) : setMoveToOpenMain(o => !o) }} loading={moving}>
                  Move to <span className="ml-1 text-[#8B91A8]">▾</span>
                </Button>
                {(moveToOpenMain || moveToOpen) && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setMoveToOpenMain(false); setMoveToOpen(false) }} />
                    <div className="absolute right-0 top-full mt-1 w-52 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg shadow-xl z-20 overflow-hidden">
                      {MOVE_TO_OPTIONS.map(opt => (
                        <button
                          key={opt.status}
                          onClick={() => { setMoveToOpenMain(false); setMoveToOpen(false); activeTab === 'future' ? handleMoveTo(opt.status) : handleMoveStatus(opt.status) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-[#F0F2F8] hover:bg-[#21253A] transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <Button variant="secondary" onClick={() => setDeleteStep(1)} className="border-[#FF4D6A]/40 text-[#FF4D6A] hover:bg-[#FF4D6A]/10">
                Delete {selectedIds.size} selected
              </Button>
            </>
          )}
          <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> New Deal</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('deals')}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors ${activeTab === 'deals' ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-[#8B91A8] hover:text-[#F0F2F8]'}`}
        >
          Deals
        </button>
        <button
          onClick={() => setActiveTab('future')}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${activeTab === 'future' ? 'bg-[#7C5CFC]/10 text-[#7C5CFC]' : 'text-[#8B91A8] hover:text-[#F0F2F8]'}`}
        >
          Future
          {futureDeals.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#7C5CFC]/20 text-[#7C5CFC] font-mono">{futureDeals.length}</span>
          )}
        </button>
      </div>

      {/* Deals tab */}
      {activeTab === 'deals' && (
        deals.length === 0 ? (
          <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
            <EmptyState icon={FileText} title="No deals yet" description="Create your first NIL deal" action={<Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> New Deal</Button>} />
          </div>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map(section => {
              const sectionDeals = activeDeals
                .filter((d: any) => section.statuses.includes(d.status))
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              return (
                <div key={section.label}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: section.accent }} />
                    <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: section.accent }}>
                      {section.label}
                    </h2>
                    <span className="text-xs text-[#5A6080]">({sectionDeals.length})</span>
                    <div className="flex-1 h-px bg-[#2A2D3E]" />
                  </div>
                  {sectionDeals.length === 0 ? (
                    <p className="text-sm text-[#5A6080] px-1 py-2">{section.empty}</p>
                  ) : (
                    <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
                      <DataTable
                        columns={columns}
                        data={sectionDeals}
                        onRowClick={(row: any) => router.push(`/deals/${row.id}`)}
                        draggable
                        dragOverId={dragOverId}
                        onRowDragStart={row => setDragId((row as any).id)}
                        onRowDragOver={row => setDragOverId((row as any).id)}
                        onRowDrop={row => handleDrop(sectionDeals, row)}
                        onRowDragEnd={() => { setDragId(null); setDragOverId(null) }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Future tab */}
      {activeTab === 'future' && (
        <div>
          <p className="text-xs text-[#5A6080] mb-4">Month 3+ installments. Select deals below to move them into the active pipeline.</p>
          {futureDeals.length === 0 ? (
            <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
              <EmptyState icon={FileText} title="No future installments" description="Future months from multi-month campaigns will appear here" />
            </div>
          ) : (
            <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
              <DataTable columns={columns} data={futureDeals} onRowClick={(row: any) => router.push(`/deals/${row.id}`)} />
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation step 1 */}
      <Modal open={deleteStep === 1} onClose={() => setDeleteStep(0)} title="Delete Deals?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#8B91A8]">
            You are about to delete <span className="text-[#F0F2F8] font-semibold">{selectedIds.size} deal{selectedIds.size > 1 ? 's' : ''}</span>. This will permanently remove all associated data.
          </p>
          <div className="bg-[#0F1117] border border-[#FF4D6A]/20 rounded-lg px-4 py-3 space-y-1 max-h-40 overflow-y-auto">
            {deals.filter(d => selectedIds.has(d.id)).map(d => (
              <p key={d.id} className="text-xs font-mono text-[#FF4D6A]">{d.deal_id}</p>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" onClick={() => setDeleteStep(2)} className="bg-[#FF4D6A]/20 text-[#FF4D6A] border border-[#FF4D6A]/40 hover:bg-[#FF4D6A]/30">
              Yes, delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation step 2 — final */}
      <Modal open={deleteStep === 2} onClose={() => setDeleteStep(0)} title="Final Confirmation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#F0F2F8] font-semibold">This cannot be undone.</p>
          <p className="text-sm text-[#8B91A8]">
            Once deleted, these deals and all their linked payment matches will be permanently gone.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setDeleteStep(0)}>Cancel</Button>
            <Button type="button" loading={deleting} onClick={handleDelete} className="bg-[#FF4D6A] text-white hover:bg-[#FF4D6A]/90 border-transparent">
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title="New Deal" size="xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Brand *" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))} options={brandOptions} placeholder="Select brand" />
            <Select label="Creator *" value={form.creator_id} onChange={e => handleCreatorChange(e.target.value)} options={creatorOptions} placeholder="Select creator" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">Rate Type</span>
            <div className="flex rounded-lg overflow-hidden border border-[#2A2D3E]">
              {[{ value: 'per_month', label: 'Per Month' }, { value: 'total', label: 'Total Campaign' }].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, rate_type: opt.value }))}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${form.rate_type === opt.value ? 'bg-[#00E5FF] text-[#0A0C10]' : 'bg-[#1A1D27] text-[#8B91A8] hover:text-[#F0F2F8]'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {isTotal && totalMonths > 1 && (
              <span className="text-xs text-[#5A6080]">÷ {totalMonths} months per deal</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input label="Brand Rate ($) *" type="number" min="0" step="0.01" value={form.brand_rate} onChange={e => setForm(f => ({ ...f, brand_rate: e.target.value }))} placeholder="1000.00" hint={isTotal ? 'Total campaign amount' : 'What brand pays TSP'} />
            <Input label="Creator Rate ($) *" type="number" min="0" step="0.01" value={form.creator_rate} onChange={e => setForm(f => ({ ...f, creator_rate: e.target.value }))} placeholder="700.00" hint={isTotal ? 'Total campaign amount' : 'What creator is told'} />
            <Input label="TSP Commission %" type="number" min="0" max="100" step="1" value={form.tsp_commission_pct} onChange={e => setForm(f => ({ ...f, tsp_commission_pct: e.target.value }))} hint={selectedCreator ? `Default: ${selectedCreator.default_commission_pct}%` : undefined} />
          </div>

          {/* Live math preview */}
          {(brandRate > 0 || creatorRate > 0) && (
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-4 space-y-3">
              {isTotal && totalMonths > 1 && (
                <p className="text-xs text-[#FFB800]">Per month: {formatCurrency(perMonthBrandRate)} brand / {formatCurrency(perMonthCreatorRate)} creator</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#5A6080] mb-1">TSP Margin</p>
                  <p className="font-mono text-[#F0F2F8] font-semibold">{formatCurrency(tspMargin)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#5A6080] mb-1">TSP Commission</p>
                  <p className="font-mono text-[#F0F2F8] font-semibold">{formatCurrency(tspCommission)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#5A6080] mb-1">TSP Total{isTotal && totalMonths > 1 ? '/mo' : ''}</p>
                  <p className="font-mono text-[#00E5FF] font-semibold">{formatCurrency(tspTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#5A6080] mb-1">Creator Gets{isTotal && totalMonths > 1 ? '/mo' : ''}</p>
                  <p className="font-mono text-[#00D084] font-semibold">{formatCurrency(creatorPayout)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <MonthYearSelect
              label="Campaign Start Month *"
              value={form.campaign_start_month}
              onChange={v => setForm(f => ({ ...f, campaign_start_month: v }))}
              hint="Month the campaign begins"
            />
            <Input
              label="Number of Months"
              type="number"
              min="1"
              max="24"
              step="1"
              value={form.campaign_months}
              onChange={e => setForm(f => ({ ...f, campaign_months: e.target.value }))}
              hint={totalMonths > 1 ? `Creates ${totalMonths} linked deals (1/${totalMonths} → ${totalMonths}/${totalMonths})` : 'Single-month campaign'}
            />
          </div>

          {totalMonths > 1 && form.campaign_start_month && (
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-3">
              <p className="text-xs text-[#5A6080] mb-2">Monthly installments that will be created:</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: totalMonths }, (_, i) => {
                  const ms = addMonthsToDate(form.campaign_start_month, i)
                  return (
                    <span key={i} className="font-mono text-xs px-2 py-0.5 rounded bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20">
                      {i + 1}/{totalMonths} · {monthLabel(ms)}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <Select label="Group" value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} options={GROUP_OPTIONS} />

          {/* Contract upload */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">Contract (optional)</label>
            {contractFile ? (
              <div className="flex items-center gap-3 bg-[#0F1117] border border-[#2A2D3E] rounded-md px-3 py-2">
                <FileCheck className="w-4 h-4 text-[#00D084] shrink-0" />
                <span className="text-sm text-[#F0F2F8] flex-1 truncate">{contractFile.name}</span>
                <button type="button" onClick={() => setContractFile(null)} className="text-xs text-[#5A6080] hover:text-[#FF4D6A] transition-colors">Remove</button>
              </div>
            ) : (
              <label className="flex items-center gap-2 border border-dashed border-[#2A2D3E] rounded-md px-3 py-3 cursor-pointer hover:border-[#00E5FF]/40 transition-colors">
                <Upload className="w-4 h-4 text-[#5A6080]" />
                <span className="text-sm text-[#8B91A8]">Click to attach contract</span>
                <span className="text-xs text-[#5A6080] ml-auto">PDF, Word, image</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg" onChange={e => setContractFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); resetForm() }}>Cancel</Button>
            <Button type="submit" loading={loading}>Create Deal</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
