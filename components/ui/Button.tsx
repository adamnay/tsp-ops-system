import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-[#00E5FF] text-[#0F1117] hover:bg-[#00B8CC] font-semibold',
    secondary: 'bg-[#1A1D27] border border-[#2A2D3E] text-[#F0F2F8] hover:bg-[#21253A]',
    ghost: 'text-[#8B91A8] hover:text-[#F0F2F8] hover:bg-[#1A1D27]',
    danger: 'bg-[#FF4D6A]/10 border border-[#FF4D6A]/20 text-[#FF4D6A] hover:bg-[#FF4D6A]/20',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}
