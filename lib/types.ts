export type PaymentMethod = 'wise' | 'paypal' | 'bank' | 'check' | 'venmo' | 'zelle'
export type BrandPaymentMethod = 'wire' | 'paypal' | 'wise' | 'check' | 'ach'
export type DealStatus = 'draft' | 'active' | 'payment_pending' | 'payment_received' | 'escrowed' | 'disbursed' | 'closed'
export type PaymentSource = 'bluevine' | 'wise' | 'paypal' | 'bank_wire' | 'other'
export type MatchStatus = 'unmatched' | 'ai_suggested' | 'confirmed' | 'rejected'
export type DisbursementStatus = 'pending_approval' | 'approved' | 'sent' | 'confirmed'
export type RecipientType = 'creator' | 'tsp'

export interface Creator {
  id: string
  created_at: string
  legal_name: string
  stage_name: string | null
  business_entity_name: string | null
  aliases: string[]
  email: string | null
  phone: string | null
  payment_method: PaymentMethod | null
  payment_details: Record<string, any> | null
  default_commission_pct: number
  notes: string | null
  instagram_url: string | null
  tiktok_url: string | null
  facebook_url: string | null
  youtube_url: string | null
}

export interface Brand {
  id: string
  created_at: string
  brand_name: string
  aliases: string[]
  primary_contact_name: string | null
  primary_contact_email: string | null
  payment_method: BrandPaymentMethod | null
  notes: string | null
}

export interface Deal {
  id: string
  created_at: string
  deal_id: string
  brand_id: string
  creator_id: string
  campaign_name: string
  brand_rate: number
  creator_rate: number
  tsp_commission_pct: number
  tsp_margin: number
  tsp_commission: number
  tsp_total: number
  creator_payout: number
  status: DealStatus
  contract_date: string | null
  expected_payment_date: string | null
  payment_reference: string | null
  notes: string | null
  brand?: Brand
  creator?: Creator
}

export interface Payment {
  id: string
  created_at: string
  amount: number
  payment_date: string
  source: PaymentSource
  sender_name: string
  memo: string | null
  matched_deal_id: string | null
  match_status: MatchStatus
  ai_match_confidence: 'high' | 'medium' | 'low' | null
  ai_match_reasoning: string | null
  ai_suggested_deal_id: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  raw_import_data: Record<string, any> | null
  matched_deal?: Deal
  ai_suggested_deal?: Deal
}

export interface Disbursement {
  id: string
  created_at: string
  deal_id: string
  payment_id: string
  recipient_type: RecipientType
  recipient_name: string
  amount: number
  status: DisbursementStatus
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  payment_method: string | null
  notes: string | null
  deal?: Deal
  payment?: Payment
}

export interface ReconcileResult {
  matched_deal_id: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  reasoning: string
  action: 'auto_confirm' | 'needs_review' | 'no_match'
  flags: string[]
}
