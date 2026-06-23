import { createClient } from '@/lib/supabase/server'
import { DealsClient } from './DealsClient'

export default async function DealsPage() {
  const supabase = createClient()
  const [{ data: deals }, { data: brands }, { data: creators }] = await Promise.all([
    supabase.from('deals').select('*, brand:brands(brand_name), creator:creators(legal_name, stage_name)').order('created_at', { ascending: true }).order('campaign_month_number', { ascending: true }),
    supabase.from('brands').select('id, brand_name').order('brand_name'),
    supabase.from('creators').select('id, legal_name, stage_name, default_commission_pct').order('legal_name'),
  ])
  return <DealsClient initialDeals={deals ?? []} brands={brands ?? []} creators={creators ?? []} />
}
