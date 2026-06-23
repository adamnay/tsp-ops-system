'use client'

interface MonthYearSelectProps {
  label?: string
  value: string // 'YYYY-MM' format
  onChange: (value: string) => void
  hint?: string
}

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i)

const SELECT_CLASS = `
  bg-[#0F1117] border border-[#2A2D3E] rounded-md px-3 py-2 text-sm text-[#F0F2F8]
  focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/20
  transition-colors appearance-none flex-1
`.trim()

export function MonthYearSelect({ label, value, onChange, hint }: MonthYearSelectProps) {
  const [year, month] = value ? value.split('-') : ['', '']

  function handleChange(newYear: string, newMonth: string) {
    if (newYear && newMonth) {
      onChange(`${newYear}-${newMonth}`)
    } else {
      onChange('')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <select
          value={month || ''}
          onChange={e => handleChange(year || String(currentYear), e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Month</option>
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={year || ''}
          onChange={e => handleChange(e.target.value, month || '')}
          className={SELECT_CLASS}
          style={{ flex: '0 0 90px' }}
        >
          <option value="">Year</option>
          {YEARS.map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
      {hint && <p className="text-xs text-[#5A6080]">{hint}</p>}
    </div>
  )
}
