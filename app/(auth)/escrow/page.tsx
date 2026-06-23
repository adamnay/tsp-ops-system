import { createClient } from '@/lib/supabase/server'
import { EscrowClient } from './EscrowClient'

export default async function EscrowPage() {
  const supabase = createClient()

  // All confirmed payments with brand info via matched deal
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      id, amount, payment_date, sender_name,
      matched_deal:deals!payments_matched_deal_id_fkey(
        id, deal_id, campaign_name, brand_rate,
        brand:brands(id, brand_name)
      )
    `)
    .eq('match_status', 'confirmed')

  // All disbursements that have been sent (money left escrow)
  const { data: disbursements } = await supabase
    .from('disbursements')
    .select(`
      id, amount, status, recipient_type, recipient_name,
      deal:deals(id, deal_id, campaign_name, brand:brands(id, brand_name))
    `)
    .in('status', ['sent', 'confirmed'])

  return <EscrowClient payments={payments ?? []} disbursements={disbursements ?? []} />
}
