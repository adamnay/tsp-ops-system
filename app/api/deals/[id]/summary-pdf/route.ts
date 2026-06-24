import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function generateDealPdf(deal: any): Promise<Buffer> {
  const PDFDocument = require('pdfkit')
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const fmt = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const statusLabel = (s: string) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—'

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827').text('TSP Talent — Deal Summary', 50, 50)
    doc.moveTo(50, 78).lineTo(562, 78).strokeColor('#E5E7EB').stroke()

    doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text('Deal ID', 50, 90)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827').text(deal.deal_id || '—', 50, 105)
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text('Status', 300, 90)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1D4ED8').text(statusLabel(deal.status), 300, 105)

    doc.fontSize(11).font('Helvetica').fillColor('#6B7280').text('Campaign', 50, 135)
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827').text(deal.campaign_name || '—', 50, 150)

    doc.moveTo(50, 178).lineTo(562, 178).strokeColor('#E5E7EB').stroke()

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text('Parties', 50, 190)
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Brand', 50, 210)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(deal.brand?.brand_name || '—', 50, 224)
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Creator', 300, 210)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(deal.creator?.stage_name || deal.creator?.legal_name || '—', 300, 224)

    doc.moveTo(50, 252).lineTo(562, 252).strokeColor('#E5E7EB').stroke()

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text('Financials', 50, 264)
    const fin = [
      { label: 'Brand Rate', value: fmt(deal.brand_rate), color: '#111827' },
      { label: 'Creator Rate', value: fmt(deal.creator_rate), color: '#111827' },
      { label: 'Creator Payout', value: fmt(deal.creator_payout), color: '#059669' },
      { label: 'TSP Commission', value: `${deal.tsp_commission_pct}%`, color: '#111827' },
      { label: 'TSP Margin', value: fmt(deal.tsp_margin), color: '#111827' },
      { label: 'TSP Total', value: fmt(deal.tsp_total), color: '#1D4ED8' },
    ]
    fin.forEach((f, i) => {
      const col = i % 2 === 0 ? 50 : 300
      const row = 284 + Math.floor(i / 2) * 40
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text(f.label, col, row)
      doc.fontSize(13).font('Helvetica-Bold').fillColor(f.color).text(f.value, col, row + 14)
    })

    const afterFin = 284 + Math.ceil(fin.length / 2) * 40
    doc.moveTo(50, afterFin).lineTo(562, afterFin).strokeColor('#E5E7EB').stroke()

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text('Details', 50, afterFin + 12)
    const created = deal.created_at
      ? new Date(deal.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '—'
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Created', 50, afterFin + 32)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(created, 50, afterFin + 46)
    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Payment Reference', 300, afterFin + 32)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(deal.payment_reference || '—', 300, afterFin + 46)

    if (deal.notes) {
      doc.moveTo(50, afterFin + 72).lineTo(562, afterFin + 72).strokeColor('#E5E7EB').stroke()
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text('Notes', 50, afterFin + 84)
      doc.fontSize(11).font('Helvetica').fillColor('#374151').text(deal.notes, 50, afterFin + 100, { width: 512 })
    }

    const footerY = doc.page.height - 50
    doc.moveTo(50, footerY - 10).lineTo(562, footerY - 10).strokeColor('#E5E7EB').stroke()
    doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF')
      .text(`Generated ${new Date().toLocaleString('en-US')} · TSP Talent`, 50, footerY, { align: 'center', width: 512 })

    doc.end()
  })
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

    const pdfBuffer = await generateDealPdf(deal)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${deal.deal_id}-summary.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (e: any) {
    console.error('Deal PDF generation error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
