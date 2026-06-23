import { createClient } from '@/lib/supabase/server'
import { ContractsClient } from './ContractsClient'

export const dynamic = 'force-dynamic'

export default async function ContractsPage() {
  const supabase = createClient()
  const { data: deals } = await supabase
    .from('deals')
    .select('id, deal_id, campaign_name, contract_file_path, brand:brands(brand_name), creator:creators(legal_name, stage_name)')
    .not('contract_file_path', 'is', null)
    .order('created_at', { ascending: false })

  return <ContractsClient deals={deals ?? []} />
}
