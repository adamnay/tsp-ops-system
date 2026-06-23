import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: rows } = await supabase.from('integration_settings').select('key, value')

  const settings: Record<string, string> = {}
  for (const row of rows ?? []) {
    settings[row.key] = row.value ?? ''
  }

  return <SettingsClient settings={settings} />
}
