import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { client_id, client_secret, mode } = await req.json()

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'Client ID and Secret are required' }, { status: 400 })
    }

    const base = mode === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.error_description || 'Invalid credentials' }, { status: 400 })
    }

    return NextResponse.json({ message: `Connected (${mode})` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
