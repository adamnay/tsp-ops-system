import { NextRequest, NextResponse } from 'next/server'
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
  if (!res.ok) throw new Error('PayPal auth failed')
  return (await res.json()).access_token
}

async function verifyWebhookSignature(
  headers: Headers,
  body: string,
  webhookId: string,
  token: string,
  mode: string
): Promise<boolean> {
  const base = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    }),
  })
  if (!res.ok) return false
  const json = await res.json()
  return json.verification_status === 'SUCCESS'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const event = JSON.parse(body)

    const supabase = createServiceClient()
    const { data: rows } = await supabase
      .from('integration_settings')
      .select('key, value')
      .in('key', ['paypal_client_id', 'paypal_client_secret', 'paypal_mode', 'paypal_webhook_id'])

    const s: Record<string, string> = {}
    for (const r of rows ?? []) s[r.key] = r.value ?? ''

    const mode = s.paypal_mode || 'sandbox'

    // Signature verification — skip in sandbox mode for easier testing
    if (s.paypal_webhook_id && s.paypal_client_id && s.paypal_client_secret && mode !== 'sandbox') {
      const token = await getPayPalToken(s.paypal_client_id, s.paypal_client_secret, mode)
      const valid = await verifyWebhookSignature(req.headers, body, s.paypal_webhook_id, token, mode)
      if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const { event_type, resource } = event

    // Handle completed payment events
    const handledEvents = [
      'PAYMENT.SALE.COMPLETED',
      'PAYMENT.CAPTURE.COMPLETED',
      'CHECKOUT.ORDER.COMPLETED',
      'MONEY.TRANSFER.COMPLETED',
    ]
    if (!handledEvents.includes(event_type)) {
      return NextResponse.json({ received: true, skipped: true })
    }

    // Extract amount and fee
    const amount = parseFloat(
      resource?.amount?.total ||
      resource?.amount?.value ||
      resource?.gross_amount?.value ||
      resource?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
      '0'
    )

    const fee = parseFloat(
      resource?.transaction_fee?.value ||
      resource?.seller_receivable_breakdown?.paypal_fee?.value ||
      resource?.purchase_units?.[0]?.payments?.captures?.[0]?.seller_receivable_breakdown?.paypal_fee?.value ||
      '0'
    )

    if (amount <= 0) return NextResponse.json({ received: true, skipped: true })

    const transactionId = resource?.id || resource?.purchase_units?.[0]?.payments?.captures?.[0]?.id

    // Deduplicate
    if (transactionId) {
      const { data: existing } = await supabase
        .from('payments')
        .select('id')
        .eq('payment_reference', transactionId)
        .maybeSingle()
      if (existing) return NextResponse.json({ received: true, duplicate: true })
    }

    // Extract payer name
    const payer = resource?.payer_info || resource?.payer
    const senderName =
      payer?.payer_name?.alternate_full_name ||
      `${payer?.name?.given_name || ''} ${payer?.name?.surname || ''}`.trim() ||
      payer?.email_address ||
      resource?.payee?.email_address ||
      'PayPal'

    const date = (resource?.create_time || new Date().toISOString()).substring(0, 10)
    const memo = resource?.note_to_payer || resource?.description || null

    const payment = {
      amount,
      payment_date: date,
      source: 'paypal',
      sender_name: senderName,
      memo,
      match_status: 'unmatched',
      payment_reference: transactionId || null,
      raw_import_data: { paypal_event_type: event_type, paypal_mode: mode, paypal_resource_id: transactionId, paypal_fee: fee || null },
    }

    const { data: inserted, error } = await supabase
      .from('payments')
      .insert(payment)
      .select('id, amount, payment_date, source, sender_name, memo')
      .single()

    if (error) throw new Error(error.message)

    // Run AI reconciliation in background
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    fetch(`${baseUrl}/api/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: inserted.id, payment: inserted }),
    }).catch(() => {})

    return NextResponse.json({ received: true, imported: true, payment_id: inserted.id })
  } catch (e: any) {
    console.error('PayPal webhook error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
