'use client'
import { useState } from 'react'
import { Creator, Deal } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AliasInput } from '@/components/ui/AliasInput'
import { Textarea } from '@/components/ui/Textarea'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, Mail, Phone, CreditCard, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'
import { useRouter } from 'next/navigation'

function toAbsoluteUrl(url: string): string {
  if (!url) return url
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

const PAYMENT_METHOD_OPTIONS = [
  { value: 'wise', label: 'Wise' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
]

interface Props {
  creator: Creator
  deals: (Deal & { brand?: { brand_name: string } })[]
}

export function CreatorDetailClient({ creator: initialCreator, deals }: Props) {
  const [creator, setCreator] = useState(initialCreator)
  const [editOpen, setEditOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({
    legal_name: creator.legal_name,
    stage_name: creator.stage_name || '',
    business_entity_name: creator.business_entity_name || '',
    aliases: creator.aliases || [],
    email: creator.email || '',
    phone: creator.phone || '',
    payment_method: creator.payment_method || '',
    default_commission_pct: String(creator.default_commission_pct || 30),
    notes: creator.notes || '',
    instagram_url: creator.instagram_url || '',
    tiktok_url: creator.tiktok_url || '',
    facebook_url: creator.facebook_url || '',
    youtube_url: creator.youtube_url || '',
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    if (!form.phone.trim()) {
      toast.error('Phone number is required')
      setLoading(false)
      return
    }
    if (!form.default_commission_pct.toString().trim() || isNaN(parseFloat(form.default_commission_pct))) {
      toast.error('Default commission % is required')
      setLoading(false)
      return
    }
    if (!form.instagram_url.trim()) {
      toast.error('Instagram URL is required')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.from('creators').update({
      legal_name: form.legal_name,
      stage_name: form.stage_name || null,
      business_entity_name: form.business_entity_name || null,
      aliases: form.aliases,
      email: form.email || null,
      phone: form.phone || null,
      payment_method: form.payment_method || null,
      default_commission_pct: parseFloat(form.default_commission_pct),
      notes: form.notes || null,
      instagram_url: form.instagram_url.trim() || null,
      tiktok_url: form.tiktok_url.trim() || null,
      facebook_url: form.facebook_url.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
    }).eq('id', creator.id).select().single()

    if (error) {
      toast.error(error.message)
    } else {
      setCreator(data)
      setEditOpen(false)
      toast.success('Creator updated')
      logActivity({ action: 'Creator updated', entity_type: 'creator', entity_id: creator.id, entity_label: creator.legal_name })
      router.refresh()
    }
    setLoading(false)
  }

  const totalBrandRate = deals.reduce((sum, d) => sum + (d.brand_rate || 0), 0)
  const totalCreatorPayout = deals.reduce((sum, d) => sum + (d.creator_payout || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/creators" className="text-[#8B91A8] hover:text-[#F0F2F8] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[#F0F2F8]">{creator.legal_name}</h1>
          {creator.stage_name && <p className="text-[#8B91A8] text-sm">@{creator.stage_name}</p>}
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Edit className="w-4 h-4" /> Edit
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Commission Rate</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00E5FF]">{creator.default_commission_pct}%</p>
          <p className="text-[#5A6080] text-xs mt-1">Default TSP commission</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Deals</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#F0F2F8]">{deals.length}</p>
          <p className="text-[#5A6080] text-xs mt-1">All time</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Brand Rate</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00E5FF]">{formatCurrency(totalBrandRate)}</p>
          <p className="text-[#5A6080] text-xs mt-1">Gross deal value</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Creator Payout</CardTitle></CardHeader>
          <p className="font-mono text-2xl font-semibold text-[#00D084]">{formatCurrency(totalCreatorPayout)}</p>
          <p className="text-[#5A6080] text-xs mt-1">Creator earnings</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-[#5A6080]" />
              <span className="text-[#F0F2F8]">{creator.email || '—'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-[#5A6080]" />
              <span className="text-[#F0F2F8]">{creator.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <CreditCard className="w-4 h-4 text-[#5A6080]" />
              <span className="text-[#F0F2F8] capitalize">{creator.payment_method || '—'}</span>
            </div>
          </div>
          {creator.aliases && creator.aliases.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-2">Payment Aliases</p>
              <div className="flex flex-wrap gap-1.5">
                {creator.aliases.map((a) => (
                  <span key={a} className="px-2 py-0.5 bg-[#21253A] border border-[#2A2D3E] rounded text-xs text-[#F0F2F8]">{a}</span>
                ))}
              </div>
            </div>
          )}
          {(creator.instagram_url || creator.tiktok_url || creator.facebook_url || creator.youtube_url) && (
            <div className="mt-4">
              <p className="text-xs text-[#8B91A8] uppercase tracking-wider mb-2">Social Media</p>
              <div className="flex flex-wrap gap-2">
                {creator.instagram_url && (
                  <a href={toAbsoluteUrl(creator.instagram_url!)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-[#E1306C]/10 border-[#E1306C]/30 text-[#E1306C] hover:bg-[#E1306C]/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    Instagram <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                )}
                {creator.tiktok_url && (
                  <a href={toAbsoluteUrl(creator.tiktok_url!)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-[#F0F2F8]/10 border-[#F0F2F8]/20 text-[#F0F2F8] hover:bg-[#F0F2F8]/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.73a4.85 4.85 0 01-1.01-.04z"/></svg>
                    TikTok <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                )}
                {creator.youtube_url && (
                  <a href={toAbsoluteUrl(creator.youtube_url!)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-[#FF0000]/10 border-[#FF0000]/30 text-[#FF4444] hover:bg-[#FF0000]/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    YouTube <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                )}
                {creator.facebook_url && (
                  <a href={toAbsoluteUrl(creator.facebook_url!)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors bg-[#1877F2]/10 border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/20">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <p className="text-sm text-[#8B91A8]">{creator.notes || 'No notes'}</p>
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
                  {['Deal ID', 'Campaign', 'Brand', 'Creator Rate', 'Creator Payout', 'Status'].map(h => (
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
                    <td className="py-3 px-4 text-[#8B91A8]">{(deal as any).brand?.brand_name || '—'}</td>
                    <td className="py-3 px-4 font-mono text-[#F0F2F8]">{formatCurrency(deal.creator_rate)}</td>
                    <td className="py-3 px-4 font-mono text-[#00D084]">{formatCurrency(deal.creator_payout)}</td>
                    <td className="py-3 px-4"><StatusBadge status={deal.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Creator" size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Legal Name *" value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} />
            <Input label="Stage Name" value={form.stage_name} onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))} />
          </div>
          <Input label="Business Entity Name" value={form.business_entity_name} onChange={e => setForm(f => ({ ...f, business_entity_name: e.target.value }))} />
          <AliasInput label="Payment Aliases" value={form.aliases} onChange={(aliases) => setForm(f => ({ ...f, aliases }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <div className="relative">
              <Input label="Phone *" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              {!form.phone.trim() && <p className="text-[10px] text-[#FF4D6A] mt-1">Required</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Payment Method" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} options={PAYMENT_METHOD_OPTIONS} placeholder="Select method" />
            <div className="relative">
              <Input label="Default Commission % *" type="number" min="0" max="100" value={form.default_commission_pct} onChange={e => setForm(f => ({ ...f, default_commission_pct: e.target.value }))} />
              {(!form.default_commission_pct.toString().trim() || isNaN(parseFloat(form.default_commission_pct))) && <p className="text-[10px] text-[#FF4D6A] mt-1">Required</p>}
            </div>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          <div>
            <p className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider mb-3">Social Media</p>
            <div className="space-y-3">
              <div className="relative">
                <Input
                  label="Instagram URL *"
                  value={form.instagram_url}
                  onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
                  placeholder="instagram.com/username"
                />
                {!form.instagram_url.trim() && <p className="text-[10px] text-[#FF4D6A] mt-1">Required</p>}
              </div>
              <Input label="TikTok URL" value={form.tiktok_url} onChange={e => setForm(f => ({ ...f, tiktok_url: e.target.value }))} placeholder="tiktok.com/@username" />
              <Input label="YouTube URL" value={form.youtube_url} onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))} placeholder="youtube.com/@channel" />
              <Input label="Facebook URL" value={form.facebook_url} onChange={e => setForm(f => ({ ...f, facebook_url: e.target.value }))} placeholder="facebook.com/page" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
