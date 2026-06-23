'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileCheck, Download, FileX } from 'lucide-react'
import { SearchBar } from '@/components/ui/SearchBar'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface Props {
  deals: any[]
}

export function ContractsClient({ deals }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  async function download(deal: any) {
    setDownloading(deal.id)
    const { data, error } = await supabase.storage.from('contracts').createSignedUrl(deal.contract_file_path, 60)
    if (error || !data) {
      toast.error('Could not generate download link')
    } else {
      window.open(data.signedUrl, '_blank')
    }
    setDownloading(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Contracts</h1>
          <p className="text-[#8B91A8] text-sm">{deals.length} contract{deals.length !== 1 ? 's' : ''} on file</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search contracts…" />
      </div>

      {deals.length === 0 ? (
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg flex flex-col items-center gap-3 py-16">
          <FileX className="w-10 h-10 text-[#5A6080]" />
          <p className="text-[#8B91A8] text-sm">No contracts uploaded yet</p>
          <p className="text-[#5A6080] text-xs">Upload a contract from any deal's detail page</p>
        </div>
      ) : (
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg divide-y divide-[#2A2D3E]">
          {deals.filter((deal: any) => {
            const q = search.toLowerCase()
            return !q ||
              deal.brand?.brand_name?.toLowerCase().includes(q) ||
              deal.creator?.legal_name?.toLowerCase().includes(q) ||
              deal.creator?.stage_name?.toLowerCase().includes(q) ||
              deal.deal_id?.toLowerCase().includes(q) ||
              deal.contract_file_path?.toLowerCase().includes(q)
          }).map((deal: any) => {
            const fileName = deal.contract_file_path?.split('/').pop() ?? '—'
            const dealName = `${deal.brand?.brand_name} × ${deal.creator?.stage_name || deal.creator?.legal_name}`
            return (
              <div key={deal.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#21253A]/40 transition-colors">
                <FileCheck className="w-5 h-5 text-[#00D084] shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link href={`/deals/${deal.id}`} className="text-sm font-medium text-[#F0F2F8] hover:text-[#00E5FF] transition-colors">
                    {dealName}
                  </Link>
                  <p className="text-xs text-[#5A6080] font-mono truncate mt-0.5">{fileName}</p>
                </div>
                <span className="text-xs font-mono text-[#8B91A8] shrink-0">{deal.deal_id}</span>
                <button
                  onClick={() => download(deal)}
                  disabled={downloading === deal.id}
                  className="flex items-center gap-1.5 text-xs text-[#00E5FF] hover:underline disabled:opacity-50 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading === deal.id ? 'Opening…' : 'Download'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
