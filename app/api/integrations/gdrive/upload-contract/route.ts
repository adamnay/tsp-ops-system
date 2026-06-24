import { NextRequest, NextResponse } from 'next/server'

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
      return NextResponse.json({ error: 'Google Drive not configured' }, { status: 503 })
    }

    const { signedUrl, fileName } = await req.json()
    if (!signedUrl || !fileName) {
      return NextResponse.json({ error: 'signedUrl and fileName required' }, { status: 400 })
    }

    // Download file via the signed URL generated on the client
    const fileRes = await fetch(signedUrl)
    if (!fileRes.ok) {
      return NextResponse.json({ error: `Failed to fetch file: ${fileRes.status}` }, { status: 500 })
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer())

    // Parse service account credentials
    let credentials: any
    try {
      credentials = JSON.parse(serviceAccountJson)
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
      }
    } catch {
      return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON' }, { status: 500 })
    }

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
