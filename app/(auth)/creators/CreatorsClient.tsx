'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Creator } from '@/lib/types'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SearchBar } from '@/components/ui/SearchBar'
import { AliasInput } from '@/components/ui/AliasInput'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Users, Plus, Download } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import Link from 'next/link'

const PAYMENT_METHOD_OPTIONS = [
  { value: 'wise', label: 'Wise' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
]

interface Props {
  initialCreators: Creator[]
}

export function CreatorsClient({ initialCreators }: Props) {
  const [creators, setCreators] = useState(initialCreators)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    legal_name: '',
    stage_name: '',
    business_entity_name: '',
    aliases: [] as string[],
    email: '',
    phone: '',
    payment_method: '',
    default_commission_pct: '30',
    notes: '',
  })

  function resetForm() {
    setForm({ legal_name: '', stage_name: '', business_entity_name: '', aliases: [], email: '', phone: '', payment_method: '', default_commission_pct: '30', notes: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.legal_name.trim()) return toast.error('Legal name is required')
    setLoading(true)
    const { data, error } = await supabase.from('creators').insert({
      legal_name: form.legal_name.trim(),
      stage_name: form.stage_name || null,
      business_entity_name: form.business_entity_name || null,
      aliases: form.aliases,
      email: form.email || null,
      phone: form.phone || null,
      payment_method: form.payment_method || null,
      default_commission_pct: parseFloat(form.default_commission_pct) || 30,
      notes: form.notes || null,
    }).select().single()

    if (error) {
      toast.error(error.message)
    } else {
      setCreators([data, ...creators])
      toast.success('Creator added')
      logActivity({ action: 'Creator added', entity_type: 'creator', entity_id: data.id, entity_label: data.legal_name })
      setModalOpen(false)
      resetForm()
    }
    setLoading(false)
  }

  const columns = [
    {
      key: 'legal_name',
      header: 'Creator',
      render: (row: Creator) => (
        <div>
          <Link href={`/creators/${row.id}`} className="text-[#F0F2F8] hover:text-[#00E5FF] font-medium transition-colors">
            {row.legal_name}
          </Link>
          {row.stage_name && <p className="text-xs text-[#8B91A8]">@{row.stage_name}</p>}
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row: Creator) => <span className="text-[#8B91A8]">{row.email || '—'}</span> },
    { key: 'default_commission_pct', header: 'Commission', render: (row: Creator) => <span className="font-mono text-[#F0F2F8]">{row.default_commission_pct}%</span> },
    { key: 'aliases', header: 'Aliases', render: (row: Creator) => <span className="text-[#8B91A8]">{row.aliases?.length ?? 0} names</span> },
    { key: 'payment_method', header: 'Payment', render: (row: Creator) => <span className="text-[#8B91A8] capitalize">{row.payment_method || '—'}</span> },
    { key: 'created_at', header: 'Added', render: (row: Creator) => <span className="text-[#5A6080] text-xs">{formatDate(row.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Creators</h1>
          <p className="text-[#8B91A8] text-sm">{creators.length} creators</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search creators…" />
          <Button variant="secondary" onClick={() => downloadCSV(creators.map(c => ({ 'Legal Name': c.legal_name, 'Stage Name': c.stage_name || '', 'Email': c.email || '', 'Phone': c.phone || '', 'Payment Method': c.payment_method || '', 'Commission %': c.default_commission_pct || '', 'Notes': c.notes || '' })), 'creators')}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> New Creator</Button>
        </div>
      </div>

      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
        <DataTable
          columns={columns}
          data={creators.filter(c => {
            const q = search.toLowerCase()
            return !q || c.legal_name?.toLowerCase().includes(q) || c.stage_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
          })}
          onRowClick={(row) => router.push(`/creators/${row.id}`)}
          emptyState={
            <EmptyState
              icon={Users}
              title="No creators yet"
              description="Add your first creator to get started"
              action={<Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Add Creator</Button>}
            />
          }
        />
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title="New Creator" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Legal Name *" value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} placeholder="Jane Smith" />
            <Input label="Stage Name / Handle" value={form.stage_name} onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))} placeholder="janesmith" />
          </div>
          <Input label="Business Entity Name" value={form.business_entity_name} onChange={e => setForm(f => ({ ...f, business_entity_name: e.target.value }))} placeholder="Jane Smith LLC" />
          <AliasInput
            label="Payment Aliases"
            value={form.aliases}
            onChange={(aliases) => setForm(f => ({ ...f, aliases }))}
            placeholder="Add known payment name variations"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
            <Input label="Phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Method" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} options={PAYMENT_METHOD_OPTIONS} placeholder="Select method" />
            <Input label="Default Commission %" type="number" min="0" max="100" step="1" value={form.default_commission_pct} onChange={e => setForm(f => ({ ...f, default_commission_pct: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." rows={3} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); resetForm() }}>Cancel</Button>
            <Button type="submit" loading={loading}>Create Creator</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
