'use client'
import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  emptyState?: React.ReactNode
  className?: string
  draggable?: boolean
  dragOverId?: string | null
  onRowDragStart?: (row: T) => void
  onRowDragOver?: (row: T) => void
  onRowDrop?: (row: T) => void
  onRowDragEnd?: () => void
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyState,
  className,
  draggable,
  dragOverId,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2A2D3E]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left py-3 px-4 text-xs font-medium text-[#8B91A8] uppercase tracking-wider',
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              draggable={draggable}
              onDragStart={draggable ? e => { e.dataTransfer.effectAllowed = 'move'; onRowDragStart?.(row) } : undefined}
              onDragOver={draggable ? e => { e.preventDefault(); onRowDragOver?.(row) } : undefined}
              onDrop={draggable ? e => { e.preventDefault(); onRowDrop?.(row) } : undefined}
              onDragEnd={draggable ? () => onRowDragEnd?.() : undefined}
              className={cn(
                'border-b border-[#2A2D3E]/50 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-[#1A1D27]',
                draggable && 'cursor-grab active:cursor-grabbing',
                dragOverId === row.id && 'border-t-2 border-t-[#00E5FF] bg-[#00E5FF]/5',
                i % 2 === 0 ? 'bg-transparent' : 'bg-[#1A1D27]/30'
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('py-3 px-4 text-[#F0F2F8]', col.className)}>
                  {col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
