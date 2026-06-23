import { createClient } from '@/lib/supabase/client'

interface ActivityParams {
  action: string
  entity_type?: string
  entity_id?: string
  entity_label?: string
  metadata?: Record<string, any>
}

export async function logActivity(params: ActivityParams): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activity_logs').insert({
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      entity_label: params.entity_label ?? null,
      metadata: params.metadata ?? null,
      user_email: user?.email ?? 'unknown',
    })
  } catch (err) {
    console.error('[activity] log failed:', err)
  }
}
