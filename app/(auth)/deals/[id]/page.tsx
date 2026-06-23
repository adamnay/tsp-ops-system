import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { DealDetailClient } from './DealDetailClient'

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [{ data: deal }, { data: payments }, { data: disbursements }] = await Promise.all([
    supabase.from('deals').select('*, brand:brands(*), creator:creators(*)').eq('id', params.id).single(),
    supabase.from('payments').select('*').eq('matched_deal_id', params.id).order('payment_date', { ascending: false }),
    supabase.from('disbursements').select('*').eq('deal_id', params.id).order('created_at', { ascending: false }),
  ])
  if (!deal) notFound()
  return <DealDetailClient deal={deal} payments={payments ?? []} disbursements={disbursements ?? []} />
}
