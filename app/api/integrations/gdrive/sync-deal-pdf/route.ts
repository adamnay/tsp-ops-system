import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { Readable } from 'stream'

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

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827')
      .text('TSP Talent — Deal Summary', 50, 50)

    doc.moveTo(50, 78).lineTo(562, 78).strokeColor('#E5E7EB').stroke()

    // Deal ID + status
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
      .text('Deal ID', 50, 90)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827')
      .text(deal.deal_id || '—', 50, 105)

    doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
      .text('Status', 300, 90)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1D4ED8')
      .text(statusLabel(deal.status), 300, 105)

    // Campaign name
    doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
      .text('Campaign', 50, 135)
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
      .text(deal.campaign_name || '—', 50, 150)

    doc.moveTo(50, 178).lineTo(562, 178).strokeColor('#E5E7EB').stroke()

    // ── Parties ───────────────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151')
      .text('Parties', 50, 190)

    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Brand', 50, 210)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
      .text(deal.brand?.brand_name || '—', 50, 224)

    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Creator', 300, 210)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
      .text(deal.creator?.stage_name || deal.creator?.legal_name || '—', 300, 224)

    doc.moveTo(50, 252).lineTo(562, 252).strokeColor('#E5E7EB').stroke()

    // ── Financials ────────────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151')
      .text('Financials', 50, 264)

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

    // ── Details ───────────────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151')
      .text('Details', 50, afterFin + 12)

    const created = deal.created_at
      ? new Date(deal.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '—'

    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Created', 50, afterFin + 32)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(created, 50, afterFin + 46)

    doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Payment Reference', 300, afterFin + 32)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
      .text(deal.payment_reference || '—', 300, afterFin + 46)

    if (deal.notes) {
      doc.moveTo(50, afterFin + 72).lineTo(562, afterFin + 72).strokeColor('#E5E7EB').stroke()
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text('Notes', 50, afterFin + 84)
      doc.fontSize(11).font('Helvetica').fillColor('#374151')
        .text(deal.notes, 50, afterFin + 100, { width: 512 })
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50
    doc.moveTo(50, footerY - 10).lineTo(562, footerY - 10).strokeColor('#E5E7EB').stroke()
    doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF')
      .text(`Generated ${new Date().toLocaleString('en-US')} · TSP Talent`, 50, footerY, { align: 'center', width: 512 })

    doc.end()
  })
}

async function getDriveClient(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson)
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
  return google.drive({ version: 'v3', auth })
}

async function findOrCreateFolder(drive: any, parentId: string, folderName: string): Promise<string> {
  const search = await drive.files.list({
    q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)',
  })
  if (search.data.files?.[0]?.id) return search.data.files[0].id

  const folder = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return folder.data.id!
}

export async function POST(req: NextRequest) {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    const folderId = process.env.GOOGLE_DRIVE_CONTRACTS_FOLDER_ID

    if (!serviceAccountJson || !folderId) {
      return NextResponse.json({ error: 'Google Drive not configured' }, { status: 503 })
    }

    const { deal } = await req.json()
    if (!deal?.deal_id) {
      return NextResponse.json({ error: 'deal data required' }, { status: 400 })
    }

    const pdfBuffer = await generateDealPdf(deal)
    const drive = await getDriveClient(serviceAccountJson)
    const dealFolderId = await findOrCreateFolder(drive, folderId, deal.deal_id)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const pdfName = `${deal.deal_id}-summary-${timestamp}.pdf`

    const response = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: pdfName,
        parents: [dealFolderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(pdfBuffer),
      },
      fields: 'id, name',
    })

    return NextResponse.json({ fileId: response.data.id, name: response.data.name })
  } catch (e: any) {
    console.error('Deal PDF sync error:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
