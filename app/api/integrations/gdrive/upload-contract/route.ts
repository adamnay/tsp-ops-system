import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

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

export async function POST(req: NextRequest) {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    const folderId = process.env.GOOGLE_DRIVE_CONTRACTS_FOLDER_ID

    if (!serviceAccountJson || !folderId) {
      return NextResponse.json({ error: 'Google Drive not configured — set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_CONTRACTS_FOLDER_ID in Vercel' }, { status: 503 })
    }

    const { filePath, fileName } = await req.json()
    if (!filePath || !fileName) {
      return NextResponse.json({ error: 'filePath and fileName required' }, { status: 400 })
    }

    // Parse credentials — handle escaped newlines in private_key
    let credentials: any
    try {
      credentials = JSON.parse(serviceAccountJson)
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
      }
    } catch {
      return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON' }, { status: 500 })
    }

    // Download file from Supabase storage
    const supabase = createServiceClient()
    const { data: blob, error: downloadError } = await supabase.storage
      .from('contracts')
      .download(filePath)

    if (downloadError || !blob) {
      return NextResponse.json({ error: `Storage download failed: ${downloadError?.message}` }, { status: 500 })
    }

    const buffer = Buffer.from(await blob.arrayBuffer())

    // Lazy-load googleapis to avoid edge runtime bundling issues
    const { google } = await import('googleapis')
    const { Readable } = await import('stream')

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    const drive = google.drive({ version: 'v3', auth })

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: getMimeType(fileName),
        body: Readable.from(buffer),
      },
      fields: 'id, name, webViewLink',
    })

    return NextResponse.json({
      fileId: response.data.id,
      name: response.data.name,
      url: response.data.webViewLink,
    })
  } catch (e: any) {
    console.error('Google Drive upload error:', e.message, e.stack)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
