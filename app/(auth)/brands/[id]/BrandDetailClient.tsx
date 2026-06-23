'use client'
import { useState } from 'react'
import { Brand, Deal } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { AliasInput } from '@/components/ui/AliasInput'
import { Textarea } from '@/components/ui/Textarea'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, Mail, User } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import { useRouter } from 'next/navigation'

const ALL_PAYMENT_METHODS = ['bluevine', 'wire', 'paypal', 'wise', 'ach', 'check', 'bank_wire', 'other']
const METHOD_LABELS: Record<string, string> = {
  bluevine: 'Bluevine', wire: 'Wire', paypal: 'PayPal', wise: 'Wise',
  ach: 'ACH', check: 'Check', bank_wire: 'Bank Wire', other: 'Other',
}

interface Props {
  brand: Brand
  deals: (Deal & { creator?: { legal_name: string; stage_name: string | null } })[]
  confirmedPayments: { id: string; amount: number }[]
}

export function BrandDetailClient({ brand: initialBrand, deals, confirmedPayments }: Props) {
  const [brand, setBrand] = useState(initialBrand)
  const [editOpen, setEditOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({
    brand_name: brand.brand_name,
    aliases: brand.aliases || [],
    payment_methods: (brand as any).payment_methods || [],
    primary_contact_name: brand.primary_contact_name || '',
    primary_contact_email: brand.primary_contact_email || '',
    notes: brand.notes || '',
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.from('brands').update({
      brand_name: form.brand_name,
      aliases: form.aliases,
      payment_methods: form.payment_methods,
      primary_contact_name: form.primary_contact_name || null,
      primary_contact_email: form.primary_contact_email || null,
      notes: form.notes || null,
    }).eq('id', brand.id).select().single()

    if (error) { toast.error(error.message) } else {
      setBrand(data)
      setEditOpen(false)
      toast.success('Brand updated')
      logActivity({ action: 'Brand updated', entity_type: 'brand', entity_id: brand.id, entity_label: brand.brand_name })
      router.refresh()
    }
    setLoading(false)
  }

  const totalBrandRate = deals.reduce((sum, d) => sum + (d.brand_rate || 0), 0)
  const confirmedTotal = confirmedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  const stillOwed = Math.max(0, totalBrandRate - confirmedTotal)
  const activeDeals = deals.filter(d => !(d as any).is_future)
  const futureDeals = deals.filter(d => (d as any).is_future)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/brands" className="text-[#8B91A8] hover:text-[#F0F2F8] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[#F0F2F8]">{brand.brand_name}</h1>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}><Edit className="w-4 h-4" /> Edit</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Deals</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#F0F2F8]">{deals.length}</p>
          {futureDeals.length > 0 && (
            <p className="text-xs text-[#5A6080] mt-1">{activeDeals.length} active · {futureDeals.length} future</p>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Deal Value</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00E5FF]">{formatCurrency(totalBrandRate)}</p>
          <p className="text-xs text-[#5A6080] mt-1">Across all deals</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Confirmed Received</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00D084]">{formatCurrency(confirmedTotal)}</p>
          <p className="text-xs text-[#5A6080] mt-1">Payments confirmed</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Still Owed</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#FF4D6A]">{formatCurrency(stillOwed)}</p>
          <p className="text-xs text-[#5A6080] mt-1">Outstanding balance</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-[#5A6080]" />
              <span className="text-[#F0F2F8]">{brand.primary_contact_name || '—'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-[#5A6080]" />
              <span className="text-[#F0F2F8]">{brand.primary_contact_email || '—'}</span>
            </div>
          </div>
          {((brand as any).payment_methods?.length > 0) && (
            <div className="mt-4">
              <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-2">Payment Methods</p>
              <div className="flex flex-wrap gap-1.5">
                {((brand as any).payment_methods as string[]).map(m => (
                  <span key={m} className="px-2 py-0.5 bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded text-xs text-[#00E5FF] uppercase">{METHOD_LABELS[m] ?? m}</span>
                ))}
              </div>
            </div>
          )}
          {brand.aliases && brand.aliases.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-2">Payment Aliases</p>
              <div className="flex flex-wrap gap-1.5">
                {brand.aliases.map((a) => (
                  <span key={a} className="px-2 py-0.5 bg-[#21253A] border border-[#2A2D3E] rounded text-xs text-[#F0F2F8]">{a}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <p className="text-sm text-[#8B91A8]">{brand.notes || 'No notes'}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Deals</h2>
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
          {deals.length === 0 ? (
            <p className="px-5 py-8 text-center text-[#5A6080] text-sm">No deals yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2D3E]">
                  {['Deal ID', 'Campaign', 'Creator', 'Brand Rate', 'Creator Rate', 'Status'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#8B91A8] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id} className="border-b border-[#2A2D3E]/50">
                    <td className="py-3 px-4 font-mono text-xs text-[#8B91A8]">{deal.deal_id}</td>
                    <td className="py-3 px-4 text-[#F0F2F8]">
                      <Link href={`/deals/${deal.id}`} className="hover:text-[#00E5FF] transition-colors">{deal.campaign_name}</Link>
                    </td>
                    <td className="py-3 px-4 text-[#8B91A8]">{(deal as any).creator?.stage_name || (deal as any).creator?.legal_name || '—'}</td>
                    <td className="py-3 px-4 font-mono text-[#F0F2F8]">{formatCurrency(deal.brand_rate)}</td>
                    <td className="py-3 px-4 font-mono text-[#8B91A8]">{formatCurrency(deal.creator_rate)}</td>
                    <td className="py-3 px-4"><StatusBadge status={deal.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Brand" size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Brand Name *" value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} />
          <AliasInput label="Payment Aliases" value={form.aliases} onChange={(aliases) => setForm(f => ({ ...f, aliases }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Primary Contact" value={form.primary_contact_name} onChange={e => setForm(f => ({ ...f, primary_contact_name: e.target.value }))} />
            <Input label="Contact Email" type="email" value={form.primary_contact_email} onChange={e => setForm(f => ({ ...f, primary_contact_email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8B91A8] uppercase tracking-wider mb-2">Payment Methods</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PAYMENT_METHODS.map(m => {
                const active = form.payment_methods.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      payment_methods: active ? f.payment_methods.filter((x: string) => x !== m) : [...f.payment_methods, m],
                    }))}
                    className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                      active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                        : 'bg-[#0F1117] text-[#8B91A8] border border-[#2A2D3E] hover:text-[#F0F2F8]'
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                )
              })}
            </div>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
