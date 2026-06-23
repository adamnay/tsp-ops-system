import { createClient } from '@/lib/supabase/server'
import { PaymentsClient } from './PaymentsClient'

export default async function PaymentsPage() {
  const supabase = createClient()
  const { data: payments } = await supabase
    .from('payments')
    .select('*, matched_deal:deals!payments_matched_deal_id_fkey(deal_id, campaign_name, brand:brands(brand_name))')
    .order('payment_date', { ascending: false })

  return <PaymentsClient initialPayments={payments ?? []} />
}
