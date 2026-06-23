import { createClient } from '@/lib/supabase/server'
import { DisbursementsClient } from './DisbursementsClient'

export default async function DisbursementsPage() {
  const supabase = createClient()

  const { data: disbursements } = await supabase
    .from('disbursements')
    .select(`
      *,
      deal:deals(deal_id, campaign_name, status, brand_rate, brand:brands(brand_name), creator:creators(id, legal_name, stage_name, payment_method), payments:payments(raw_import_data)),
      payment:payments(amount, payment_date, sender_name, raw_import_data)
    `)
    .order('created_at', { ascending: false })

  return <DisbursementsClient initialDisbursements={disbursements ?? []} />
}
