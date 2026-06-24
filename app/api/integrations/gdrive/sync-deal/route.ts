import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { createClient } from '@supabase/supabase-js'
import { generateDealPdfBytes } from '@/lib/deal-pdf'

export const runtime = 'nodejs'

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}

async function getDrive(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson)
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.file'] })
  return google.drive({ version: 'v3', auth })
}

async function findOrCreateFolder(drive: any, parentId: string, name: string): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id)',
  })
  if (res.data.files?.[0]?.id) return res.data.files[0].id
  const folder = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return folder.data.id!
}

async function uploadToDrive(drive: any, folderId: string, name: string, buffer: Buffer, mimeType: string) {
  return drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, name',
  })
}

export async function POST(req: NextRequest) {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    const rootFolderId = process.env.GOOGLE_DRIVE_CONTRACTS_FOLDER_ID
    if (!serviceAccountJson || !rootFolderId) {
      return NextResponse.json({ error: 'Google Drive not configured' }, { status: 503 })
    }

    const formData = await req.formData()
    const dealJson = formData.get('deal') as string | null
    const contractFile = formData.get('contractFile') as File | null
    const contractFileName = formData.get('contractFileName') as string | null
    const parentFolderName = formData.get('parentFolderName') as string | null
    const pdfOnly = formData.get('pdfOnly') === 'true'

    if (!dealJson) return NextResponse.json({ error: 'deal data required' }, { status: 400 })

    const deal = JSON.parse(dealJson)
    if (!deal?.deal_id) return NextResponse.json({ error: 'deal_id required' }, { status: 400 })

    const drive = await getDrive(serviceAccountJson)

    // For multi-month campaigns, nest deal folder inside a campaign parent folder
    const containerFolderId = parentFolderName
      ? await findOrCreateFolder(drive, rootFolderId, parentFolderName)
      : rootFolderId
    const dealFolderId = await findOrCreateFolder(drive, containerFolderId, deal.deal_id)

    const uploads: string[] = []

    // Upload contract file if provided (skip when pdfOnly flag is set)
    if (!pdfOnly && contractFile && contractFileName) {
      const buffer = Buffer.from(await contractFile.arrayBuffer())
      await uploadToDrive(drive, dealFolderId, contractFileName, buffer, getMimeType(contractFileName))
      uploads.push('contract')
    }

    // Always generate and upload deal summary PDF
    let pdfError: string | null = null
    let pdfFileId: string | null = null
    try {
      const pdfBuffer = Buffer.from(await generateDealPdfBytes(deal))
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const pdfName = `${deal.deal_id}-summary-${timestamp}.pdf`

      // Upload to Google Drive
      const pdfRes = await uploadToDrive(drive, dealFolderId, pdfName, pdfBuffer, 'application/pdf')
      pdfFileId = pdfRes.data.id
      uploads.push('summary')

      // Also save to Supabase storage and update deal record
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey)
        const storagePath = `summaries/${deal.deal_id}/latest.pdf`
        await supabase.storage.from('contracts').upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })
        await supabase.from('deals').update({ summary_pdf_path: storagePath }).eq('id', deal.id)
      }
    } catch (pdfErr: any) {
      console.error('[sync-deal] PDF generation/upload error:', pdfErr.message, pdfErr.stack)
      pdfError = pdfErr.message
    }

    return NextResponse.json({ dealFolderId, uploads, pdfError, pdfFileId })
  } catch (e: any) {
    console.error('Drive sync error:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
