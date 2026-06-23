import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BrandDetailClient } from './BrandDetailClient'

export default async function BrandDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [{ data: brand }, { data: deals }] = await Promise.all([
    supabase.from('brands').select('*').eq('id', params.id).single(),
    supabase.from('deals').select('*, creator:creators(legal_name, stage_name)').eq('brand_id', params.id).order('created_at', { ascending: false }),
  ])
  if (!brand) notFound()

  const dealIds = (deals ?? []).map(d => d.id)
  const { data: confirmedPayments } = dealIds.length
    ? await supabase.from('payments').select('id, amount').eq('match_status', 'confirmed').in('matched_deal_id', dealIds)
    : { data: [] }

  return <BrandDetailClient brand={brand} deals={deals ?? []} confirmedPayments={confirmedPayments ?? []} />
}
