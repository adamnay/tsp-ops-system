import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { content, category } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'No content' }, { status: 400 })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are editing an AI payment reconciliation playbook for TSP Talent, a NIL talent agency. Rewrite the following rule as a single, precise, factual statement. Remove filler words. Keep all specific names, amounts, and patterns exactly as given. Return only the rewritten rule — no explanation, no quotes, no prefix.

Category: ${category}
Rule: ${content}`,
    }],
  })

  const rewritten = message.content[0].type === 'text' ? message.content[0].text.trim() : content
  return NextResponse.json({ rewritten })
}
