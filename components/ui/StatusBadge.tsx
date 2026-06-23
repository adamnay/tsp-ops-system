import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  // Deal statuses
  draft: { label: 'Pending', className: 'text-[#5A6080] bg-[#5A6080]/10' },
  active: { label: 'Active', className: 'text-[#00D084] bg-[#00D084]/10' },
  payment_pending: { label: 'Payment Pending', className: 'text-[#FFB800] bg-[#FFB800]/10' },
  partial_payment_received: { label: 'Partial Payment Received', className: 'text-[#FF9500] bg-[#FF9500]/10' },
  payment_received: { label: 'Payment Received', className: 'text-[#00E5FF] bg-[#00E5FF]/10' },
  escrowed: { label: 'Escrowed', className: 'text-purple-400 bg-purple-400/10' },
  disbursed: { label: 'Disbursed', className: 'text-[#00D084] bg-[#00D084]/10' },
  closed: { label: 'Closed', className: 'text-[#5A6080] bg-[#5A6080]/10' },
  // Match statuses
  unmatched: { label: 'Unmatched', className: 'text-[#FF4D6A] bg-[#FF4D6A]/10' },
  ai_suggested: { label: 'AI Suggested', className: 'text-[#FFB800] bg-[#FFB800]/10' },
  confirmed: { label: 'Confirmed', className: 'text-[#00D084] bg-[#00D084]/10' },
  rejected: { label: 'Rejected', className: 'text-[#5A6080] bg-[#5A6080]/10' },
  // Disbursement statuses
  pending_approval: { label: 'Pending Approval', className: 'text-[#FFB800] bg-[#FFB800]/10' },
  approved: { label: 'Approved', className: 'text-[#00E5FF] bg-[#00E5FF]/10' },
  sent: { label: 'Sent', className: 'text-[#00D084] bg-[#00D084]/10' },
  // Ignored
  ignored: { label: 'Ignored', className: 'text-[#5A6080] bg-[#5A6080]/10' },
  // Confidence
  high: { label: 'High', className: 'text-[#00D084] bg-[#00D084]/10' },
  medium: { label: 'Medium', className: 'text-[#FFB800] bg-[#FFB800]/10' },
  low: { label: 'Low', className: 'text-[#FF4D6A] bg-[#FF4D6A]/10' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'text-[#8B91A8] bg-[#8B91A8]/10' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', config.className, className)}>
      {config.label}
    </span>
  )
}
