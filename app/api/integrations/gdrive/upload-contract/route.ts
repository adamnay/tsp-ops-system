import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'
import { Readable } from 'stream'

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
      return NextResponse.json({ error: 'Google Drive not configured' }, { status: 503 })
    }

    const { filePath, fileName } = await req.json()
    if (!filePath || !fileName) {
      return NextResponse.json({ error: 'filePath and fileName required' }, { status: 400 })
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
    const readable = Readable.from(buffer)

    // Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    const drive = google.drive({ version: 'v3', auth })

    // Upload to Drive folder
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: getMimeType(fileName),
        body: readable,
      },
      fields: 'id, name, webViewLink',
    })

    return NextResponse.json({
      fileId: response.data.id,
      name: response.data.name,
      url: response.data.webViewLink,
    })
  } catch (e: any) {
    console.error('Google Drive upload error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
