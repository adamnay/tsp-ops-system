import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDealPdfBytes } from '@/lib/deal-pdf'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: deal, error } = await supabase
      .from('deals')
      .select('*, brand:brands(*), creator:creators(*)')
      .eq('id', params.id)
      .single()

    if (error || !deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    const pdfBytes = await generateDealPdfBytes(deal)

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${deal.deal_id}-summary.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (e: any) {
    console.error('Deal PDF generation error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
