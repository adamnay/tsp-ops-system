'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Brand } from '@/lib/types'
import { DataTable } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AliasInput } from '@/components/ui/AliasInput'
import { Textarea } from '@/components/ui/Textarea'
import { SearchBar } from '@/components/ui/SearchBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Building2, Plus, Download } from 'lucide-react'
import { downloadCSV } from '@/lib/exportCSV'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import Link from 'next/link'

const PAYMENT_OPTIONS = [
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise' },
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
]

interface Props { initialBrands: Brand[] }

export function BrandsClient({ initialBrands }: Props) {
  const [brands, setBrands] = useState(initialBrands)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    brand_name: '', aliases: [] as string[], primary_contact_name: '',
    primary_contact_email: '', payment_method: '', notes: '',
  })

  function resetForm() {
    setForm({ brand_name: '', aliases: [], primary_contact_name: '', primary_contact_email: '', payment_method: '', notes: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.brand_name.trim()) return toast.error('Brand name is required')
    setLoading(true)
    const { data, error } = await supabase.from('brands').insert({
      brand_name: form.brand_name.trim(),
      aliases: form.aliases,
      primary_contact_name: form.primary_contact_name || null,
      primary_contact_email: form.primary_contact_email || null,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
    }).select().single()

    if (error) { toast.error(error.message) } else {
      setBrands([data, ...brands])
      toast.success('Brand added')
      logActivity({ action: 'Brand added', entity_type: 'brand', entity_id: data.id, entity_label: data.brand_name })
      setModalOpen(false)
      resetForm()
    }
    setLoading(false)
  }

  const columns = [
    {
      key: 'brand_name', header: 'Brand',
      render: (row: Brand) => (
        <Link href={`/brands/${row.id}`} className="text-[#F0F2F8] hover:text-[#00E5FF] font-medium transition-colors">
          {row.brand_name}
        </Link>
      ),
    },
    { key: 'primary_contact_name', header: 'Contact', render: (row: Brand) => <span className="text-[#8B91A8]">{row.primary_contact_name || '—'}</span> },
    { key: 'primary_contact_email', header: 'Email', render: (row: Brand) => <span className="text-[#8B91A8]">{row.primary_contact_email || '—'}</span> },
    { key: 'payment_method', header: 'Payment', render: (row: Brand) => <span className="text-[#8B91A8] uppercase text-xs">{row.payment_method || '—'}</span> },
    { key: 'aliases', header: 'Aliases', render: (row: Brand) => <span className="text-[#8B91A8]">{row.aliases?.length ?? 0} names</span> },
    { key: 'created_at', header: 'Added', render: (row: Brand) => <span className="text-[#5A6080] text-xs">{formatDate(row.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Brands</h1>
          <p className="text-[#8B91A8] text-sm">{brands.length} brands</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search brands…" />
          <Button variant="secondary" onClick={() => downloadCSV(brands.map(b => ({ 'Brand Name': b.brand_name, 'Contact Name': b.primary_contact_name || '', 'Contact Email': b.primary_contact_email || '', 'Payment Methods': ((b as any).payment_methods || []).join('; '), 'Aliases': (b.aliases || []).join('; '), 'Notes': b.notes || '' })), 'brands')}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> New Brand</Button>
        </div>
      </div>

      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
        <DataTable columns={columns} data={brands.filter(b => !search || b.brand_name?.toLowerCase().includes(search.toLowerCase()) || b.primary_contact_email?.toLowerCase().includes(search.toLowerCase()))} onRowClick={(row) => router.push(`/brands/${row.id}`)}
          emptyState={<EmptyState icon={Building2} title="No brands yet" description="Add your first brand partner" action={<Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Add Brand</Button>} />}
        />
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title="New Brand" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Brand Name *" value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} placeholder="Nike" />
          <AliasInput label="Payment Aliases" value={form.aliases} onChange={(aliases) => setForm(f => ({ ...f, aliases }))} placeholder="e.g. NKE Holdings LLC, Nike Inc." />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Primary Contact" value={form.primary_contact_name} onChange={e => setForm(f => ({ ...f, primary_contact_name: e.target.value }))} placeholder="John Smith" />
            <Input label="Contact Email" type="email" value={form.primary_contact_email} onChange={e => setForm(f => ({ ...f, primary_contact_email: e.target.value }))} placeholder="john@brand.com" />
          </div>
          <Select label="Payment Method" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} options={PAYMENT_OPTIONS} placeholder="Select method" />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); resetForm() }}>Cancel</Button>
            <Button type="submit" loading={loading}>Create Brand</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
