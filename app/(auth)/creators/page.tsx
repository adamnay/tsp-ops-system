import { createClient } from '@/lib/supabase/server'
import { CreatorsClient } from './CreatorsClient'

export default async function CreatorsPage() {
  const supabase = createClient()
  const { data: creators } = await supabase
    .from('creators')
    .select('*')
    .order('legal_name')

  return <CreatorsClient initialCreators={creators ?? []} />
}
