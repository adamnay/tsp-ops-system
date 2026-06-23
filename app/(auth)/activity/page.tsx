import { createClient } from '@/lib/supabase/server'
import { ActivityClient } from './ActivityClient'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  const supabase = createClient()
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return <ActivityClient logs={logs ?? []} />
}
