import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_RULES = `
PAYMENT RECONCILIATION
- Brands (not creators) send payments to TSP Talent
- Match sender name against brand name and brand aliases
- Deal status priority when multiple deals match the same brand: payment_pending > partial_payment_received > active > draft
- payment_pending means content is complete and payment is owed — highest priority for matching
- Memo/reference field containing a deal ID is a very strong match signal
- Consider abbreviated or legal entity names (e.g. "Nike Holdings Co" matches Nike)
- Brand's known payment methods are a corroborating signal when matching payments to brands
- All AI matches require human approval — no auto-confirmation
- Track cumulative payments per deal to handle installment scenarios
- Flag types: installment_payment, final_payment, upfront_payment, partial_amount, duplicate_risk, ambiguous_sender, overpayment

DEAL LIFECYCLE
- Statuses: draft → active → payment_pending → partial_payment_received → payment_received → disbursed → closed
- payment_pending: creator has delivered content, awaiting brand payment
- partial_payment_received: brand has paid some but not all of the brand rate
- payment_received: full brand rate collected, ready to disburse
- Deals can be marked as "future" (upcoming/not yet started)

DISBURSEMENTS
- Two disbursements created per payment confirmation: one to the creator, one to TSP Talent
- Creator receives creator_payout; TSP receives tsp_total (commission)
- Flow: pending_approval → approved → sent → confirmed
- Warn before sending if the deal hasn't been fully paid by the brand
- Creator disbursements require payment method confirmation before marking sent

BRANDS & CREATORS
- Brands have aliases (alternate sender names) for payment matching
- Brands have payment_methods array (known channels: Bluevine, Wire, PayPal, Wise, ACH, Check, etc.)
- Creators have a primary payment method (Wise, PayPal, Bank, Check, Venmo, Zelle)
- When a payment is confirmed, propose adding new aliases or payment methods to the brand profile (requires manual confirmation)
- When a disbursement is sent via a different method than stored, offer to update the creator's profile

ESCROW
- Escrow balance per brand = total confirmed payments received − total sent/confirmed disbursements
- Tracks money TSP is holding on behalf of creators

ACTIVITY LOG & UNDO
- All key actions are logged with prev_state metadata for reversibility
- Undo is supported for: deal status changes, payment match confirmed/rejected, disbursement approved/sent, brand alias added
`

export async function POST(req: NextRequest) {
  try {
    const { entries } = await req.json()

    const customSection = entries && entries.length > 0
      ? `\nCUSTOM RULES (added by TSP staff):\n${entries.map((e: any) => `- [${e.category}] ${e.content}`).join('\n')}`
      : '\nNo custom rules have been added yet.'

    const prompt = `You are documenting the AI knowledge base for TSP Talent's operations system. Write a clear, professional overview document that covers everything the AI knows about how to run TSP Talent's payment reconciliation and operations.

Use the system rules and custom rules below as your source of truth. Write in plain English as a cohesive document — not a bullet list dump. Organize it logically with short section headers (##). Be concise but complete. This document is for internal staff to understand exactly how the AI makes decisions.

SYSTEM RULES:
${SYSTEM_RULES}
${customSection}

Write the overview document now:`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ summary: text })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
