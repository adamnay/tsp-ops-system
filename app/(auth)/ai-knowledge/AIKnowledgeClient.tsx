'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Brain, Trash2, Send, ToggleRight, ToggleLeft, Check, X, RefreshCw, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { logActivity } from '@/lib/activity'

const CATEGORIES = ['Brand & Sender', 'Payment Patterns', 'Business Rules', 'General']

interface Props {
  initialEntries: any[]
}

export function AIKnowledgeClient({ initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [activeTab, setActiveTab] = useState<'playbook' | 'overview'>('playbook')
  const [input, setInput] = useState('')
  const [category, setCategory] = useState('General')
  const [adding, setAdding] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  async function generateSummary(currentEntries: any[]) {
    setGeneratingSummary(true)
    try {
      const res = await fetch('/api/generate-playbook-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: currentEntries.filter(e => e.active) }),
      })
      const result = await res.json()
      if (result.summary) setSummary(result.summary)
    } catch {
      toast.error('Failed to generate overview')
    }
    setGeneratingSummary(false)
  }


  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [input])

  useEffect(() => {
    const el = editRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editingId])

  async function handleAdd() {
    const trimmed = input.trim()
    if (!trimmed) return
    setAdding(true)

    // Rewrite via AI
    let content = trimmed
    try {
      const res = await fetch('/api/rewrite-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, category }),
      })
      const result = await res.json()
      if (result.rewritten) content = result.rewritten
    } catch {
      // fall back to original if rewrite fails
    }

    const { data, error } = await supabase
      .from('ai_knowledge')
      .insert({ category, content, active: true })
      .select().single()

    if (error) {
      toast.error(error.message)
    } else {
      const newEntries = [...entries, data]
      setEntries(newEntries)
      setInput('')
      toast.success('Added to playbook')
      logActivity({
        action: 'AI knowledge added',
        entity_type: 'ai_knowledge',
        entity_id: data.id,
        entity_label: content.slice(0, 60),
        metadata: { original: trimmed, rewritten: content, category },
      })
      // Regenerate overview in background
      generateSummary(newEntries)
    }
    setAdding(false)
  }

  function startEdit(entry: any) {
    setEditingId(entry.id)
    setEditValue(entry.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
  }

  async function saveEdit(entry: any) {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === entry.content) { cancelEdit(); return }
    setSavingEdit(true)
    const { data, error } = await supabase
      .from('ai_knowledge')
      .update({ content: trimmed })
      .eq('id', entry.id)
      .select().single()
    if (error) {
      toast.error(error.message)
    } else {
      setEntries(prev => prev.map(e => e.id === entry.id ? data : e))
      toast.success('Rule updated')
      logActivity({
        action: 'AI knowledge edited',
        entity_type: 'ai_knowledge',
        entity_id: entry.id,
        entity_label: trimmed.slice(0, 60),
        metadata: { prev: entry.content, updated: trimmed },
      })
      cancelEdit()
    }
    setSavingEdit(false)
  }

  async function toggleActive(entry: any) {
    const { data, error } = await supabase
      .from('ai_knowledge')
      .update({ active: !entry.active })
      .eq('id', entry.id)
      .select().single()
    if (error) { toast.error(error.message) } else {
      setEntries(prev => prev.map(e => e.id === entry.id ? data : e))
    }
  }

  async function deleteEntry(entry: any) {
    const { error } = await supabase.from('ai_knowledge').delete().eq('id', entry.id)
    if (error) { toast.error(error.message) } else {
      setEntries(prev => prev.filter(e => e.id !== entry.id))
      toast.success('Removed from playbook')
      logActivity({ action: 'AI knowledge deleted', entity_type: 'ai_knowledge', entity_id: entry.id, entity_label: entry.content.slice(0, 60) })
    }
  }

  const activeCount = entries.filter(e => e.active).length
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = entries.filter(e => e.category === cat)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F2F8]">AI Knowledge</h1>
          <p className="text-[#8B91A8] text-sm">{activeCount} active rule{activeCount !== 1 ? 's' : ''} — injected into every reconciliation</p>
        </div>
        <div className="flex items-center gap-1.5 bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg px-3 py-1.5">
          <Brain className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-xs text-[#00E5FF] font-medium">Live AI Context</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('playbook')}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${activeTab === 'playbook' ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-[#8B91A8] hover:text-[#F0F2F8]'}`}
        >
          <Brain className="w-3.5 h-3.5" /> Playbook
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${activeTab === 'overview' ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'text-[#8B91A8] hover:text-[#F0F2F8]'}`}
        >
          <BookOpen className="w-3.5 h-3.5" /> System Overview
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A2D3E] flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#F0F2F8]">How the AI operates this system</p>
              <p className="text-xs text-[#5A6080] mt-0.5">Generated from system rules + your playbook. Updates when you add rules.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => generateSummary(entries)}
              loading={generatingSummary}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </Button>
          </div>
          <div className="px-8 py-6">
            {generatingSummary && !summary ? (
              <div className="flex items-center gap-3 text-[#5A6080] text-sm py-8 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating overview...
              </div>
            ) : summary ? (
              <div className="prose prose-invert prose-sm max-w-none">
                {summary.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-sm font-semibold text-[#F0F2F8] uppercase tracking-wider mt-6 mb-2 first:mt-0">{line.slice(3)}</h2>
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="text-sm font-medium text-[#D0D4E8] mt-4 mb-1">{line.slice(4)}</h3>
                  }
                  if (line.startsWith('- ') || line.startsWith('* ')) {
                    return <p key={i} className="text-sm text-[#8B91A8] leading-relaxed pl-4 before:content-['·'] before:text-[#3A3D50] before:mr-2">{line.slice(2)}</p>
                  }
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <p key={i} className="text-sm font-semibold text-[#D0D4E8] mt-3 mb-1">{line.slice(2, -2)}</p>
                  }
                  if (!line.trim()) return <div key={i} className="h-2" />
                  return <p key={i} className="text-sm text-[#8B91A8] leading-relaxed">{line}</p>
                })}
              </div>
            ) : (
              <p className="text-sm text-[#5A6080] text-center py-8">Click Regenerate to generate the system overview.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'playbook' && <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <Brain className="w-8 h-8 text-[#2A2D3E] mx-auto mb-3" />
            <p className="text-[#5A6080] text-sm">The playbook is empty. Add your first rule below.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2A2D3E]">
            {CATEGORIES.map(cat => {
              const items = grouped[cat]
              if (!items.length) return null
              return (
                <div key={cat} className="px-8 py-5">
                  <h3 className="text-[10px] font-bold text-[#5A6080] uppercase tracking-widest mb-4">{cat}</h3>
                  <div className="space-y-3">
                    {items.map(entry => (
                      <div
                        key={entry.id}
                        className="group flex items-start gap-3"
                        onMouseEnter={() => setHoverId(entry.id)}
                        onMouseLeave={() => setHoverId(null)}
                      >
                        <div className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${entry.active ? 'bg-[#00E5FF]' : 'bg-[#3A3D50]'}`} />

                        {editingId === entry.id ? (
                          <div className="flex-1 flex items-start gap-2">
                            <textarea
                              ref={editRef}
                              value={editValue}
                              onChange={e => {
                                setEditValue(e.target.value)
                                e.target.style.height = 'auto'
                                e.target.style.height = e.target.scrollHeight + 'px'
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(entry) }
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="flex-1 bg-[#0F1117] border border-[#00E5FF]/40 rounded-md px-3 py-1.5 text-sm text-[#F0F2F8] focus:outline-none focus:border-[#00E5FF] resize-none overflow-hidden leading-relaxed"
                              rows={1}
                            />
                            <button onClick={() => saveEdit(entry)} disabled={savingEdit} className="mt-1 p-1 rounded text-[#00D084] hover:bg-[#00D084]/10 transition-colors">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEdit} className="mt-1 p-1 rounded text-[#5A6080] hover:text-[#FF4D6A] transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p
                              onClick={() => startEdit(entry)}
                              className={`flex-1 text-sm leading-relaxed cursor-text transition-colors hover:text-[#F0F2F8] ${entry.active ? 'text-[#D0D4E8]' : 'text-[#5A6080] line-through'}`}
                            >
                              {entry.content}
                            </p>
                            <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${hoverId === entry.id ? 'opacity-100' : 'opacity-0'}`}>
                              <button onClick={() => toggleActive(entry)} className="p-1 rounded text-[#5A6080] hover:text-[#F0F2F8] transition-colors" title={entry.active ? 'Disable' : 'Enable'}>
                                {entry.active ? <ToggleRight className="w-4 h-4 text-[#00D084]" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                              <button onClick={() => deleteEntry(entry)} className="p-1 rounded text-[#5A6080] hover:text-[#FF4D6A] transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add input */}
        <div className="border-t border-[#2A2D3E] bg-[#151821] px-8 py-5">
          <p className="text-xs text-[#5A6080] mb-3">Add to playbook — the AI will clean it up before saving</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  category === cat
                    ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                    : 'text-[#5A6080] border border-[#2A2D3E] hover:text-[#F0F2F8] hover:border-[#3A3D50]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
              }}
              placeholder={`e.g. "Nike usually pays in two installments, half upfront and half when the post goes live"`}
              className="flex-1 bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2.5 text-sm text-[#F0F2F8] placeholder-[#3A3D50] focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/20 transition-colors resize-none overflow-hidden leading-relaxed"
            />
            <Button onClick={handleAdd} loading={adding} disabled={!input.trim()}>
              <Send className="w-4 h-4" /> Add
            </Button>
          </div>
          <p className="text-xs text-[#3A3D50] mt-2">Enter to add · Shift+Enter for new line · Click any rule to edit</p>
        </div>
      </div>}
    </div>
  )
}
