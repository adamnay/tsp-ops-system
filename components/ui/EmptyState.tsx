import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[#1A1D27] border border-[#2A2D3E] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#8B91A8]" />
      </div>
      <h3 className="text-[#F0F2F8] font-medium mb-1">{title}</h3>
      <p className="text-[#8B91A8] text-sm mb-4 max-w-xs">{description}</p>
      {action}
    </div>
  )
}
