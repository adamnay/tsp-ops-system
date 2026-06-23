import { createClient } from '@/lib/supabase/server'
import { AIKnowledgeClient } from './AIKnowledgeClient'

export default async function AIKnowledgePage() {
  const supabase = createClient()
  const { data: entries } = await supabase
    .from('ai_knowledge')
    .select('*')
    .order('created_at', { ascending: false })

  return <AIKnowledgeClient initialEntries={entries ?? []} />
}
