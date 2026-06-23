import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { api_token: token } = await req.json()
    if (!token) return NextResponse.json({ error: 'API token is required' }, { status: 400 })

    const res = await fetch('https://api.transferwise.com/v1/profiles', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Invalid API token' }, { status: 400 })
    }

    const profiles = await res.json()
    const business = profiles.find((p: any) => p.type === 'BUSINESS')
    const personal = profiles.find((p: any) => p.type === 'PERSONAL')
    const name = business?.details?.name || personal?.details?.firstName || 'Account'

    return NextResponse.json({ message: `Connected — ${name}` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
