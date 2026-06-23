import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

async function getPayPalToken(clientId: string, clientSecret: string, mode: string): Promise<string> {
  const base = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('Failed to authenticate with PayPal')
  const json = await res.json()
  return json.access_token
}

export async function POST() {
  try {
    const supabase = createServiceClient()

    const { data: rows } = await supabase
      .from('integration_settings')
      .select('key, value')
      .in('key', ['paypal_client_id', 'paypal_client_secret', 'paypal_mode'])

    const s: Record<string, string> = {}
    for (const r of rows ?? []) s[r.key] = r.value ?? ''

    if (!s.paypal_client_id || !s.paypal_client_secret) {
      return NextResponse.json({ error: 'PayPal credentials not configured in Settings' }, { status: 400 })
    }

    const mode = s.paypal_mode || 'sandbox'
    const base = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
    const token = await getPayPalToken(s.paypal_client_id, s.paypal_client_secret, mode)

    // PayPal max range is 31 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 31)

    const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
    const params = new URLSearchParams({
      start_date: fmt(startDate),
      end_date: fmt(endDate),
      fields: 'all',
      page_size: '500',
      page: '1',
    })

    const txRes = await fetch(`${base}/v1/reporting/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!txRes.ok) {
      const err = await txRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.message || 'Failed to fetch transactions' }, { status: 400 })
    }

    const txData = await txRes.json()
    const transactions: any[] = txData.transaction_details ?? []

    // Debug: return raw summary
    const debug = transactions.map(tx => ({
      id: tx.transaction_info?.transaction_id,
      date: tx.transaction_info?.transaction_initiation_date,
      amount: tx.transaction_info?.transaction_amount?.value,
      status: tx.transaction_info?.transaction_status,
      payer: tx.payer_info?.payer_name?.alternate_full_name || tx.payer_info?.email_address,
    }))

    // Only keep incoming payments (positive amount, money received)
    const incoming = transactions.filter(tx => {
      const amount = parseFloat(tx.transaction_info?.transaction_amount?.value ?? '0')
      return amount > 0
    })

    if (incoming.length === 0) {
      return NextResponse.json({ imported: 0, message: 'No incoming transactions found', debug, allCount: transactions.length })
    }

    // Get existing payment_references to avoid duplicates
    const refs = incoming.map(tx => tx.transaction_info.transaction_id).filter(Boolean)
    const { data: existing } = await supabase
      .from('payments')
      .select('payment_reference')
      .in('payment_reference', refs)

    const existingRefs = new Set((existing ?? []).map((r: any) => r.payment_reference))

    const toInsert = incoming
      .filter(tx => !existingRefs.has(tx.transaction_info.transaction_id))
      .map(tx => {
        const info = tx.transaction_info
        const payer = tx.payer_info
        const amount = parseFloat(info.transaction_amount?.value ?? '0')
        const date = info.transaction_initiation_date?.substring(0, 10) ?? new Date().toISOString().substring(0, 10)
        const senderName = payer?.payer_name?.alternate_full_name || payer?.email_address || 'PayPal'
        const memo = info.transaction_note || info.transaction_subject || null

        const fee = parseFloat(info.fee_amount?.value ?? '0') || null

        return {
          amount,
          payment_date: date,
          source: 'paypal',
          sender_name: senderName,
          memo,
          match_status: 'unmatched',
          payment_reference: info.transaction_id,
          raw_import_data: { paypal_transaction_id: info.transaction_id, paypal_mode: mode, paypal_fee: fee },
        }
      })

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, message: 'All transactions already imported', debug, existingRefs: Array.from(existingRefs) })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .insert(toInsert)
      .select('id, amount, payment_date, source, sender_name, memo')
    if (insertError) throw new Error(insertError.message)

    // Run AI reconciliation for each newly inserted payment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    for (const payment of inserted ?? []) {
      fetch(`${baseUrl}/api/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: payment.id, payment }),
      }).catch(() => {})
    }

    await supabase.from('integration_settings').upsert(
      { key: 'paypal_last_synced', value: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

    return NextResponse.json({ imported: toInsert.length, total: incoming.length, debug })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
