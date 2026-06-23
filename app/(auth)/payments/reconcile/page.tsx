import { createClient } from '@/lib/supabase/server'
import { ReconcileClient } from './ReconcileClient'

export default async function ReconcilePage() {
  const supabase = createClient()

  const [{ data: payments }, { data: openDeals }] = await Promise.all([
    supabase
      .from('payments')
      .select('*')
      .in('match_status', ['unmatched', 'ai_suggested'])
      .order('payment_date', { ascending: false }),
    supabase
      .from('deals')
      .select('id, deal_id, campaign_name, brand_rate, creator_rate, tsp_total, creator_payout, tsp_commission_pct, status, payment_reference, brand:brands(id, brand_name, aliases, payment_methods), creator:creators(legal_name, stage_name)')
      .not('status', 'in', '("disbursed","closed")'),
  ])

  return <ReconcileClient initialPayments={payments ?? []} openDeals={openDeals ?? []} />
}
