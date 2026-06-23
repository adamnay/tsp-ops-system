import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const { log_id, action, entity_type, entity_id, metadata } = await req.json()
    const supabase = createServiceClient()
    const m = metadata || {}

    // ── Deal status changed ───────────────────────────────────────────
    if (action.startsWith('Deal status changed to') && entity_type === 'deal' && m.prev_status) {
      const { error } = await supabase
        .from('deals')
        .update({ status: m.prev_status })
        .eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Moved to / Moved from Future ──────────────────────────────────
    else if ((action.startsWith('Moved to') || action.startsWith('Moved from Future to')) && entity_type === 'deal') {
      const update: any = {}
      if (m.prev_status) update.status = m.prev_status
      if (m.prev_is_future !== undefined) update.is_future = m.prev_is_future
      const { error } = await supabase.from('deals').update(update).eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Payment match confirmed ───────────────────────────────────────
    else if (action === 'Payment match confirmed' && entity_type === 'payment') {
      // Revert the payment
      const { error: pErr } = await supabase.from('payments').update({
        match_status: m.prev_match_status || 'unmatched',
        matched_deal_id: null,
        confirmed_by: null,
        confirmed_at: null,
      }).eq('id', entity_id)
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })

      // Delete disbursements created for this payment
      await supabase.from('disbursements').delete().eq('payment_id', entity_id)

      // Recalculate deal status based on remaining confirmed payments
      if (m.deal_id) {
        const { data: remaining } = await supabase
          .from('payments')
          .select('amount')
          .eq('matched_deal_id', m.deal_id)
          .eq('match_status', 'confirmed')
        const total = (remaining || []).reduce((s: number, p: any) => s + p.amount, 0)
        const { data: deal } = await supabase.from('deals').select('brand_rate').eq('id', m.deal_id).single()
        const newStatus = total === 0
          ? (m.deal_status_before || 'active')
          : total >= (deal?.brand_rate || 0) ? 'payment_received' : 'partial_payment_received'
        await supabase.from('deals').update({ status: newStatus }).eq('id', m.deal_id)
      }
    }

    // ── Payment match rejected ────────────────────────────────────────
    else if (action === 'Payment match rejected' && entity_type === 'payment') {
      const { error } = await supabase.from('payments').update({
        match_status: m.prev_match_status || 'unmatched',
      }).eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Payment ignored ───────────────────────────────────────────────
    else if (action === 'Payment ignored' && entity_type === 'payment') {
      const { error } = await supabase.from('payments').update({
        match_status: m.prev_match_status || 'unmatched',
      }).eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Disbursement approved ─────────────────────────────────────────
    else if (action === 'Disbursement approved' && entity_type === 'disbursement') {
      const { error } = await supabase.from('disbursements').update({
        status: 'pending_approval',
        approved_by: null,
        approved_at: null,
      }).eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Disbursement marked as sent ───────────────────────────────────
    else if (action === 'Disbursement marked as sent' && entity_type === 'disbursement') {
      const { error } = await supabase.from('disbursements').update({
        status: 'approved',
        sent_at: null,
      }).eq('id', entity_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Bulk approved disbursements ───────────────────────────────────
    else if (action.startsWith('Bulk approved') && m.ids?.length) {
      const { error } = await supabase.from('disbursements').update({
        status: 'pending_approval',
        approved_by: null,
        approved_at: null,
      }).in('id', m.ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // ── Brand alias added ─────────────────────────────────────────────
    else if (action === 'Brand alias added' && entity_type === 'brand') {
      if (m.prev_aliases !== undefined) {
        const { error } = await supabase.from('brands').update({ aliases: m.prev_aliases }).eq('id', entity_id)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    else {
      return NextResponse.json({ error: 'This action cannot be automatically reversed.' }, { status: 422 })
    }

    // Delete the activity log entry
    await supabase.from('activity_logs').delete().eq('id', log_id)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
