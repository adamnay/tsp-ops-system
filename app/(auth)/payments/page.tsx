import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PaymentsClient } from './PaymentsClient'

export default async function PaymentsPage() {
  const supabase = createClient()
  const serviceSupabase = createServiceClient()

  const [{ data: payments }, { data: syncRow }] = await Promise.all([
    supabase
      .from('payments')
      .select('*, matched_deal:deals!payments_matched_deal_id_fkey(deal_id, campaign_name, brand:brands(brand_name))')
      .order('payment_date', { ascending: false }),
    serviceSupabase
      .from('integration_settings')
      .select('value')
      .eq('key', 'paypal_last_synced')
      .maybeSingle(),
  ])

  return <PaymentsClient initialPayments={payments ?? []} initialLastSynced={syncRow?.value ?? null} />
}
