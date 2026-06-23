import { createClient } from '@/lib/supabase/server'
import { DisbursementsClient } from './DisbursementsClient'

export default async function DisbursementsPage() {
  const supabase = createClient()

  const [{ data: disbursements }, { data: allPayments }, { data: allAllocations }] = await Promise.all([
    supabase
      .from('disbursements')
      .select(`
        *,
        deal:deals(deal_id, campaign_name, status, brand_rate, brand:brands(brand_name), creator:creators(id, legal_name, stage_name, payment_method)),
        payment:payments(amount, payment_date, sender_name, raw_import_data)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('matched_deal_id, raw_import_data')
      .not('matched_deal_id', 'is', null)
      .eq('match_status', 'confirmed'),
    supabase
      .from('payment_allocations')
      .select('deal_id, paypal_fee')
      .gt('paypal_fee', 0),
  ])

  // Build deal_id -> total PayPal fees map (direct payments + split allocations)
  const paypalFeesByDeal: Record<string, number> = {}
  for (const p of allPayments ?? []) {
    const fee = Math.abs(parseFloat(p.raw_import_data?.paypal_fee || '0') || 0)
    if (fee > 0) {
      paypalFeesByDeal[p.matched_deal_id] = (paypalFeesByDeal[p.matched_deal_id] || 0) + fee
    }
  }
  for (const a of allAllocations ?? []) {
    if (a.paypal_fee > 0) {
      paypalFeesByDeal[a.deal_id] = (paypalFeesByDeal[a.deal_id] || 0) + a.paypal_fee
    }
  }

  return <DisbursementsClient initialDisbursements={disbursements ?? []} paypalFeesByDeal={paypalFeesByDeal} />
}
