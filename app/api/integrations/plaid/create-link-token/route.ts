import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } from 'plaid'

export async function POST() {
  try {
    const supabase = createServiceClient()
    const { data: rows } = await supabase
      .from('integration_settings')
      .select('key, value')
      .in('key', ['plaid_client_id', 'plaid_secret', 'plaid_environment'])

    const s: Record<string, string> = {}
    for (const r of rows ?? []) s[r.key] = r.value ?? ''

    if (!s.plaid_client_id || !s.plaid_secret) {
      return NextResponse.json({ error: 'Plaid credentials not saved yet' }, { status: 400 })
    }

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

    const res = await client.linkTokenCreate({
      user: { client_user_id: 'tsp-ops-user' },
      client_name: 'TSP Ops',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })

    return NextResponse.json({ link_token: res.data.link_token })
  } catch (e: any) {
    const msg = e.response?.data?.error_message || e.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
