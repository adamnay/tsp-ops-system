import { createClient } from '@/lib/supabase/server'
import { SalesClient } from './SalesClient'

export default async function SalesPage() {
  const supabase = createClient()

  const [{ data: deals }, { data: payments }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, brand_id, creator_id, brand_rate, creator_rate, tsp_total, tsp_commission, creator_payout, status, created_at, contract_date, is_future, campaign_name, deal_id, brand:brands(brand_name), creator:creators(legal_name, stage_name)'),
    supabase
      .from('payments')
      .select('id, amount, payment_date, matched_deal_id, matched_deal:deals!payments_matched_deal_id_fkey(brand_id, creator_id, brand:brands(id, brand_name), creator:creators(id, legal_name, stage_name))')
      .eq('match_status', 'confirmed'),
  ])

  const allDeals = deals ?? []
  return (
    <SalesClient
      deals={allDeals.filter((d: any) => !d.is_future)}
      futureDeals={allDeals.filter((d: any) => d.is_future)}
      payments={payments ?? []}
    />
  )
}
