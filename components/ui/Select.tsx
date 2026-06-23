import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">
            {label}
          </label>
        )}
        <select
          ref={ref}
          {...props}
          className={cn(
            'bg-[#0F1117] border border-[#2A2D3E] rounded-md px-3 py-2 text-sm text-[#F0F2F8]',
            'focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/20',
            'transition-colors appearance-none',
            error && 'border-[#FF4D6A]',
            className
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-[#FF4D6A]">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
