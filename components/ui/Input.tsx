import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          {...props}
          className={cn(
            'bg-[#0F1117] border border-[#2A2D3E] rounded-md px-3 py-2 text-sm text-[#F0F2F8] placeholder-[#5A6080]',
            'focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/20',
            'transition-colors',
            error && 'border-[#FF4D6A]',
            className
          )}
        />
        {hint && <p className="text-xs text-[#5A6080]">{hint}</p>}
        {error && <p className="text-xs text-[#FF4D6A]">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
