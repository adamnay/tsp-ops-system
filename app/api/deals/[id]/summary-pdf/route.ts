import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const runtime = 'nodejs'

function hex(h: string) {
  const n = parseInt(h.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusLabel = (s: string) =>
  s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—'

export async function generateDealPdfBytes(deal: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const gray = hex('#6B7280')
  const dark = hex('#111827')
  const blue = hex('#1D4ED8')
  const green = hex('#059669')
  const lightGray = hex('#E5E7EB')

  let y = height - 50

  // Header
  page.drawText('TSP Talent — Deal Summary', { x: 50, y, font: bold, size: 18, color: dark })
  y -= 22
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: lightGray })
  y -= 20

  // Deal ID + Status
  page.drawText('Deal ID', { x: 50, y, font: regular, size: 9, color: gray })
  page.drawText('Status', { x: 300, y, font: regular, size: 9, color: gray })
  y -= 14
  page.drawText(deal.deal_id || '—', { x: 50, y, font: bold, size: 11, color: dark })
  page.drawText(statusLabel(deal.status), { x: 300, y, font: bold, size: 11, color: blue })
  y -= 20

  // Campaign
  page.drawText('Campaign', { x: 50, y, font: regular, size: 9, color: gray })
  y -= 14
  page.drawText(deal.campaign_name || '—', { x: 50, y, font: bold, size: 13, color: dark })
  y -= 20

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: lightGray })
  y -= 16

  // Parties
  page.drawText('Parties', { x: 50, y, font: bold, size: 11, color: hex('#374151') })
  y -= 18
  page.drawText('Brand', { x: 50, y, font: regular, size: 9, color: gray })
  page.drawText('Creator', { x: 300, y, font: regular, size: 9, color: gray })
  y -= 14
  page.drawText(deal.brand?.brand_name || '—', { x: 50, y, font: bold, size: 11, color: dark })
  page.drawText(deal.creator?.stage_name || deal.creator?.legal_name || '—', { x: 300, y, font: bold, size: 11, color: dark })
  y -= 20

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: lightGray })
  y -= 16

  // Financials
  page.drawText('Financials', { x: 50, y, font: bold, size: 11, color: hex('#374151') })
  y -= 18

  const fin = [
    { label: 'Brand Rate', value: fmt(deal.brand_rate), color: dark },
    { label: 'Creator Rate', value: fmt(deal.creator_rate), color: dark },
    { label: 'Creator Payout', value: fmt(deal.creator_payout), color: green },
    { label: 'TSP Commission', value: `${deal.tsp_commission_pct}%`, color: dark },
    { label: 'TSP Margin', value: fmt(deal.tsp_margin), color: dark },
    { label: 'TSP Total', value: fmt(deal.tsp_total), color: blue },
  ]
  for (let i = 0; i < fin.length; i += 2) {
    const left = fin[i], right = fin[i + 1]
    page.drawText(left.label, { x: 50, y, font: regular, size: 9, color: gray })
    if (right) page.drawText(right.label, { x: 300, y, font: regular, size: 9, color: gray })
    y -= 14
    page.drawText(left.value, { x: 50, y, font: bold, size: 12, color: left.color })
    if (right) page.drawText(right.value, { x: 300, y, font: bold, size: 12, color: right.color })
    y -= 22
  }

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: lightGray })
  y -= 16

  // Details
  page.drawText('Details', { x: 50, y, font: bold, size: 11, color: hex('#374151') })
  y -= 18
  const created = deal.created_at
    ? new Date(deal.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'
  page.drawText('Created', { x: 50, y, font: regular, size: 9, color: gray })
  page.drawText('Payment Reference', { x: 300, y, font: regular, size: 9, color: gray })
  y -= 14
  page.drawText(created, { x: 50, y, font: bold, size: 11, color: dark })
  page.drawText(deal.payment_reference || '—', { x: 300, y, font: bold, size: 11, color: dark })
  y -= 20

  if (deal.notes) {
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: lightGray })
    y -= 16
    page.drawText('Notes', { x: 50, y, font: bold, size: 11, color: hex('#374151') })
    y -= 16
    page.drawText(deal.notes.slice(0, 200), { x: 50, y, font: regular, size: 10, color: hex('#374151'), maxWidth: 512 })
  }

  // Footer
  const footerY = 40
  page.drawLine({ start: { x: 50, y: footerY + 12 }, end: { x: 562, y: footerY + 12 }, thickness: 1, color: lightGray })
  page.drawText(`Generated ${new Date().toLocaleString('en-US')} · TSP Talent`, {
    x: 50, y: footerY, font: regular, size: 8, color: hex('#9CA3AF'),
  })

  return doc.save()
}

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
