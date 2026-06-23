import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PlaidApi, PlaidEnvironments, Configuration } from 'plaid'

export async function POST(req: NextRequest) {
  try {
    const { public_token, institution } = await req.json()

    const supabase = createServiceClient()
    const { data: rows } = await supabase
      .from('integration_settings')
      .select('key, value')
      .in('key', ['plaid_client_id', 'plaid_secret', 'plaid_environment'])

    const s: Record<string, string> = {}
    for (const r of rows ?? []) s[r.key] = r.value ?? ''

    const env = s.plaid_environment === 'production'
      ? PlaidEnvironments.production
      : s.plaid_environment === 'development'
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox

    const client = new PlaidApi(new Configuration({
      basePath: env,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': s.plaid_client_id,
          'PLAID-SECRET': s.plaid_secret,
        },
      },
    }))

    const res = await client.itemPublicTokenExchange({ public_token })
    const accessToken = res.data.access_token

    await supabase.from('integration_settings').upsert([
      { key: 'plaid_access_token', value: accessToken, updated_at: new Date().toISOString() },
      { key: 'plaid_institution', value: institution ?? '', updated_at: new Date().toISOString() },
    ], { onConflict: 'key' })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const msg = e.response?.data?.error_message || e.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
