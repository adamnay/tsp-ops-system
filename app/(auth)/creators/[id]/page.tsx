import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CreatorDetailClient } from './CreatorDetailClient'

export default async function CreatorDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: creator }, { data: deals }] = await Promise.all([
    supabase.from('creators').select('*').eq('id', params.id).single(),
    supabase.from('deals').select('*, brand:brands(brand_name)').eq('creator_id', params.id).order('created_at', { ascending: false }),
  ])

  if (!creator) notFound()

  return <CreatorDetailClient creator={creator} deals={deals ?? []} />
}
