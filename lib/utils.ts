import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 10)
}

export function generateDealId(brandName: string, creatorName: string): string {
  const year = new Date().getFullYear()
  const brandSlug = slugify(brandName).toUpperCase()
  const creatorSlug = slugify(creatorName).toUpperCase()
  return `TSP-${year}-${brandSlug}-${creatorSlug}`
}

export function generatePaymentReference(dealId: string): string {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${dealId}-${rand}`
}

export const DEAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Pending',
  active: 'Active',
  payment_pending: 'Payment Pending',
  payment_received: 'Payment Received',
  escrowed: 'Escrowed',
  disbursed: 'Disbursed',
  closed: 'Closed',
}

export const DEAL_STATUS_COLORS: Record<string, string> = {
  draft: 'text-textMuted bg-textMuted/10',
  active: 'text-success bg-success/10',
  payment_pending: 'text-warning bg-warning/10',
  payment_received: 'text-accent bg-accent/10',
  escrowed: 'text-purple-400 bg-purple-400/10',
  disbursed: 'text-success bg-success/10',
  closed: 'text-textMuted bg-textMuted/10',
}

export const MATCH_STATUS_COLORS: Record<string, string> = {
  unmatched: 'text-error bg-error/10',
  ai_suggested: 'text-warning bg-warning/10',
  confirmed: 'text-success bg-success/10',
  rejected: 'text-textMuted bg-textMuted/10',
}

export const DISBURSEMENT_STATUS_COLORS: Record<string, string> = {
  pending_approval: 'text-warning bg-warning/10',
  approved: 'text-accent bg-accent/10',
  sent: 'text-success bg-success/10',
  confirmed: 'text-success bg-success/10',
}
