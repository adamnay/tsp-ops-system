import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import { DollarSign } from 'lucide-react'

async function getEscrowBalance(): Promise<number> {
  try {
    const supabase = createClient()
    const [{ data: payments }, { data: disbursements }] = await Promise.all([
      supabase.from('payments').select('id, amount').eq('match_status', 'confirmed'),
      supabase.from('disbursements').select('id, amount').in('status', ['sent', 'confirmed']),
    ])
    const uniqueIn = Array.from(new Map((payments ?? []).map(p => [p.id, p])).values())
    const uniqueOut = Array.from(new Map((disbursements ?? []).map(d => [d.id, d])).values())
    const totalIn = uniqueIn.reduce((s, p) => s + p.amount, 0)
    const totalOut = uniqueOut.reduce((s, d) => s + d.amount, 0)
    return Math.max(0, totalIn - totalOut)
  } catch {
    return 0
  }
}

export async function Header() {
  const escrow = await getEscrowBalance()

  return (
    <header className="h-14 border-b border-[#2A2D3E] bg-[#1A1D27] flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-2 bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2">
        <DollarSign className="w-4 h-4 text-[#00E5FF]" />
        <span className="text-[#8B91A8] text-xs uppercase tracking-wider mr-2">Escrow Balance</span>
        <span className="font-mono text-[#00E5FF] font-semibold text-sm">{formatCurrency(escrow)}</span>
      </div>
    </header>
  )
}
