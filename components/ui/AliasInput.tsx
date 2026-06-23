'use client'
import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface AliasInputProps {
  label: string
  value: string[]
  onChange: (aliases: string[]) => void
  placeholder?: string
}

export function AliasInput({ label, value, onChange, placeholder }: AliasInputProps) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setInput('')
    }
  }

  const remove = (alias: string) => {
    onChange(value.filter((a) => a !== alias))
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">{label}</label>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder || 'Add alias and press Enter'}
          className="flex-1 bg-[#0F1117] border border-[#2A2D3E] rounded-md px-3 py-2 text-sm text-[#F0F2F8] placeholder-[#5A6080] focus:outline-none focus:border-[#00E5FF]"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-[#00E5FF]/10 border border-[#00E5FF]/20 text-[#00E5FF] rounded-md hover:bg-[#00E5FF]/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((alias) => (
            <span key={alias} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#21253A] border border-[#2A2D3E] rounded text-xs text-[#F0F2F8]">
              {alias}
              <button type="button" onClick={() => remove(alias)} className="text-[#8B91A8] hover:text-[#FF4D6A]">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
