'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchBar } from '@/components/ui/SearchBar'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  logs: any[]
}

export function ActivityClient({ logs: initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs)
  const [search, setSearch] = useState('')
  const [pendingUndo, setPendingUndo] = useState<any | null>(null)
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
  const [undoing, setUndoing] = useState(false)
  const router = useRouter()

  const filtered = search
    ? logs.filter(l =>
        l.action?.toLowerCase().includes(search.toLowerCase()) ||
        l.entity_label?.toLowerCase().includes(search.toLowerCase()) ||
        l.user_email?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  function openUndo(log: any) {
    setPendingUndo(log)
    setConfirmStep(1)
  }

  function closeUndo() {
    setPendingUndo(null)
    setConfirmStep(1)
  }

  async function confirmUndo() {
    if (!pendingUndo) return
    setUndoing(true)
    const res = await fetch('/api/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log_id: pendingUndo.id,
        action: pendingUndo.action,
        entity_type: pendingUndo.entity_type,
        entity_id: pendingUndo.entity_id,
        metadata: pendingUndo.metadata,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast.error(result.error || 'Undo failed')
    } else {
      setLogs(prev => prev.filter(l => l.id !== pendingUndo.id))
      toast.success('Action undone successfully')
      router.refresh()
    }
    setUndoing(false)
    closeUndo()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">Activity Log</h1>
          <p className="text-[#8B91A8] text-sm">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search activity…" />
      </div>

      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg overflow-hidden">
        {!filtered.length ? (
          <p className="px-5 py-10 text-center text-[#5A6080] text-sm">
            {search ? 'No matching events' : 'No activity recorded yet'}
          </p>
        ) : (
          <div className="divide-y divide-[#2A2D3E]">
            {filtered.map((log: any) => (
              <div key={log.id} className="group flex items-start gap-4 px-5 py-3 hover:bg-[#21253A]/40 transition-colors">
                <div className="mt-1.5 w-2 h-2 rounded-full bg-[#00E5FF] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#F0F2F8]">
                    {log.action}
                    {log.entity_label && (
                      <span className="ml-1 text-[#00E5FF] font-mono text-xs">{log.entity_label}</span>
                    )}
                  </p>
                  <p className="text-xs text-[#5A6080] mt-0.5">{log.user_email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <time className="text-xs text-[#5A6080] font-mono">
                    {new Date(log.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit', hour12: true,
                    })}
                  </time>
                  <button
                    onClick={() => openUndo(log)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-[#5A6080] hover:text-[#FF4D6A] px-2 py-1 rounded hover:bg-[#FF4D6A]/10"
                    title="Undo this activity"
                  >
                    <RotateCcw className="w-3 h-3" /> Undo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 1 confirmation */}
      <Modal open={!!pendingUndo && confirmStep === 1} onClose={closeUndo} title="Undo Activity?" size="sm">
        {pendingUndo && (
          <div className="space-y-4">
            <p className="text-sm text-[#8B91A8]">
              You are about to undo:
            </p>
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-3 text-sm">
              <p className="text-[#F0F2F8]">{pendingUndo.action}</p>
              {pendingUndo.entity_label && (
                <p className="text-[#00E5FF] font-mono text-xs mt-1">{pendingUndo.entity_label}</p>
              )}
              <p className="text-[#5A6080] text-xs mt-1">
                {new Date(pendingUndo.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                })}
              </p>
            </div>
            <p className="text-xs text-[#5A6080]">This will reverse the action and remove it from the activity log.</p>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={closeUndo}>Cancel</Button>
              <Button onClick={() => setConfirmStep(2)} className="bg-[#FF4D6A]/20 text-[#FF4D6A] border border-[#FF4D6A]/40 hover:bg-[#FF4D6A]/30">
                Yes, undo
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Step 2 confirmation */}
      <Modal open={!!pendingUndo && confirmStep === 2} onClose={closeUndo} title="Final Confirmation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#F0F2F8] font-semibold">This cannot be undone.</p>
          <p className="text-sm text-[#8B91A8]">The activity record will be permanently removed from the log.</p>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={closeUndo}>Cancel</Button>
            <Button loading={undoing} onClick={confirmUndo} className="bg-[#FF4D6A] text-white hover:bg-[#FF4D6A]/90 border-transparent">
              Remove permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
