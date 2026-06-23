import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { payment_id, payment } = await req.json()

    const supabase = createServiceClient()

    // Fetch active AI knowledge entries
    const { data: knowledge } = await supabase
      .from('ai_knowledge')
      .select('category, label, content')
      .eq('active', true)
      .order('category')

    // Fetch all open deals with brand/creator aliases
    const { data: deals } = await supabase
      .from('deals')
      .select(`
        id, deal_id, campaign_name, brand_rate, creator_rate, tsp_commission_pct,
        creator_payout, tsp_total, status, payment_reference,
        brand:brands(id, brand_name, aliases, payment_methods),
        creator:creators(id, legal_name, stage_name, aliases)
      `)
      .not('status', 'in', '("disbursed","closed")')

    if (!deals || deals.length === 0) {
      if (payment_id) {
        await supabase.from('payments').update({
          match_status: 'unmatched',
          ai_match_confidence: 'low',
          ai_match_reasoning: 'No open deals found in the system.',
        }).eq('id', payment_id)
      }
      return NextResponse.json({ matched_deal_id: null, confidence: 'none', reasoning: 'No open deals found.', action: 'no_match', flags: [] })
    }

    // For each deal, fetch all previously confirmed payments to know cumulative amount paid
    const dealIds = deals.map((d: any) => d.id)
    const { data: confirmedPayments } = await supabase
      .from('payments')
      .select('matched_deal_id, amount, payment_date, sender_name, id')
      .in('matched_deal_id', dealIds)
      .in('match_status', ['confirmed'])
      .neq('id', payment_id || '00000000-0000-0000-0000-000000000000')

    // Build cumulative payment map per deal
    const paidByDeal: Record<string, { total: number; payments: any[] }> = {}
    for (const p of confirmedPayments || []) {
      if (!paidByDeal[p.matched_deal_id]) paidByDeal[p.matched_deal_id] = { total: 0, payments: [] }
      paidByDeal[p.matched_deal_id].total += p.amount
      paidByDeal[p.matched_deal_id].payments.push({ amount: p.amount, date: p.payment_date, sender: p.sender_name })
    }

    const dealsContext = deals.map((d: any) => {
      const paid = paidByDeal[d.id] || { total: 0, payments: [] }
      const remaining = Math.max(0, d.brand_rate - paid.total)
      return {
        id: d.id,
        deal_id: d.deal_id,
        brand_name: d.brand?.brand_name,
        brand_aliases: d.brand?.aliases || [],
        brand_payment_methods: d.brand?.payment_methods || [],
        creator_name: d.creator?.legal_name,
        creator_stage_name: d.creator?.stage_name,
        brand_rate: d.brand_rate,
        status: d.status,
        payment_reference: d.payment_reference,
        total_paid_so_far: paid.total,
        remaining_balance: remaining,
        is_fully_paid: paid.total >= d.brand_rate,
        payment_history: paid.payments,
      }
    })

    const knowledgeSection = knowledge && knowledge.length > 0
      ? `\nCUSTOM KNOWLEDGE (rules taught by TSP staff — treat these as high-priority context):\n${knowledge.map(k => `- [${k.category}${k.label ? ` / ${k.label}` : ''}] ${k.content}`).join('\n')}\n`
      : ''

    const prompt = `You are a payment reconciliation assistant for TSP Talent, a NIL talent agency. Match the incoming payment to the most likely open deal, using full payment history context.${knowledgeSection}

INCOMING PAYMENT:
- Amount: $${payment.amount}
- Date: ${payment.payment_date}
- Sender: "${payment.sender_name}"
- Memo/Reference: "${payment.memo || 'none'}"
- Source: ${payment.source}

OPEN DEALS (${deals.length} total — each includes full payment history so you know what's already been paid):
${JSON.stringify(dealsContext, null, 2)}

MATCHING RULES:
1. The brand (not the creator) sends payments to TSP. Match sender_name against brand_name and brand_aliases.
1b. Each deal includes brand_payment_methods — the known payment channels for that brand. If the incoming payment's source matches a brand's known payment methods, that is a strong corroborating signal. If the source does NOT match any known methods for a brand, treat it as a weak signal against that match (but not a dealbreaker if other signals are strong).
2. Payments can arrive at ANY deal stage. Brands often pay upfront or in installments.
2b. DEAL STATUS PRIORITY: When a sender matches multiple deals for the same brand, prioritize in this order: (1) payment_pending — content is complete and payment is owed/overdue, highest priority; (2) partial_payment_received — a payment installment is already in progress, next payment most likely continues that deal; (3) active — deal is live but no payment yet started; (4) draft — deal not yet finalized. This priority reflects business logic: a brand is most likely paying for a deal that is already finished and waiting on payment.
3. The memo may contain payment_reference or deal_id — exact match is a very strong signal.
4. Consider abbreviated/legal entity names (e.g. "Nike Holdings Co" for Nike).
5. USE PAYMENT HISTORY — each deal shows total_paid_so_far and remaining_balance:
   - If a deal has prior payments, the new payment likely covers part or all of the remaining_balance.
   - Example: deal is $1000, $500 already paid, remaining is $500. A new $250 payment from the same sender is most likely a partial installment of the remaining $500 balance — flag as "installment_payment".
   - A new payment that exactly matches remaining_balance is likely the final payment — flag as "final_payment".
   - A new payment to a fully-paid deal is suspicious — flag as "duplicate_risk".
6. Amount matching against remaining_balance is more meaningful than against brand_rate when prior payments exist.
7. Flag "upfront_payment" if no prior payments and amount is roughly 40-60% of brand_rate.
8. Flag "installment_payment" if prior payments exist and this appears to be a follow-on installment.
9. Flag "final_payment" if total_paid_so_far + this payment >= brand_rate.
10. Flag "overpayment" if total_paid_so_far + this payment > brand_rate significantly.
11. Flag "duplicate_risk" if deal is already fully paid and this payment would exceed brand_rate.
12. Flag "ambiguous_sender" if sender matches multiple brands.
13. Flag "partial_amount" if after this payment the deal is still not fully paid.

Return ONLY valid JSON:
{
  "matched_deal_id": "uuid or null",
  "confidence": "high | medium | low | none",
  "reasoning": "Plain English explanation including what's been paid so far and what this payment represents, max 3 sentences",
  "action": "auto_confirm | needs_review | no_match",
  "flags": ["installment_payment", "upfront_payment", "final_payment", "partial_amount", "duplicate_risk", "ambiguous_sender", "overpayment"]
}

Rules for action:
- NEVER use "auto_confirm" — all matches require human approval
- "needs_review" if a deal was matched (confidence high, medium, or low with a matched_deal_id)
- "no_match" if confidence is low or none and no deal was matched`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    let result: any
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText)
    } catch {
      result = { matched_deal_id: null, confidence: 'low', reasoning: 'AI response parsing failed.', action: 'no_match', flags: ['parse_error'] }
    }

    // Always require human approval — never auto-confirm
    if (result.action === 'auto_confirm') result.action = 'needs_review'

    if (payment_id) {
      const matchStatus = result.matched_deal_id ? 'ai_suggested' : 'unmatched'

      await supabase.from('payments').update({
        match_status: matchStatus,
        ai_match_confidence: result.confidence === 'none' ? 'low' : result.confidence,
        ai_match_reasoning: result.reasoning,
        ai_suggested_deal_id: result.matched_deal_id || null,
        matched_deal_id: null,
        confirmed_by: null,
        confirmed_at: null,
      }).eq('id', payment_id)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Reconcile error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
