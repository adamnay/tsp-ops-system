'use client'
import { useState } from 'react'
import { Settings, CheckCircle, XCircle, Loader2, Eye, EyeOff, Link2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { usePlaidLink } from 'react-plaid-link'

interface Props {
  settings: Record<string, string>
}

function SecretInput({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <label className="block text-xs font-medium text-[#8B91A8] mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Enter ${label}`}
          className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-3 py-2 text-sm text-[#F0F2F8] placeholder-[#3A3D52] focus:outline-none focus:border-[#00E5FF]/50 pr-9"
        />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A6080] hover:text-[#8B91A8]">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

function StatusBadge({ status, message }: { status: Status; message?: string }) {
  if (status === 'idle') return null
  if (status === 'testing') return (
    <span className="flex items-center gap-1 text-xs text-[#8B91A8]"><Loader2 className="w-3 h-3 animate-spin" /> Testing…</span>
  )
  if (status === 'ok') return (
    <span className="flex items-center gap-1 text-xs text-[#00E5A0]"><CheckCircle className="w-3 h-3" /> {message || 'Connected'}</span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-[#FF4D6A]"><XCircle className="w-3 h-3" /> {message || 'Failed'}</span>
  )
}

function SectionCard({ title, description, status, children }: { title: string; description: string; status: Status; message?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#F0F2F8]">{title}</h2>
          <p className="text-xs text-[#5A6080] mt-0.5">{description}</p>
        </div>
        {status === 'ok' && (
          <span className="flex items-center gap-1 text-xs font-medium text-[#00E5A0] bg-[#00E5A0]/10 border border-[#00E5A0]/20 px-2 py-1 rounded-full">
            <CheckCircle className="w-3 h-3" /> Connected
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function PlaidSection({ linkToken, onSuccess }: { linkToken: string | null; onSuccess: (publicToken: string, metadata: any) => void }) {
  const { open, ready } = usePlaidLink({ token: linkToken ?? '', onSuccess })
  if (!linkToken) return null
  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="flex items-center gap-2 px-4 py-2 bg-[#00E5FF]/10 border border-[#00E5FF]/30 rounded-lg text-sm text-[#00E5FF] hover:bg-[#00E5FF]/20 transition-colors disabled:opacity-50"
    >
      <Link2 className="w-4 h-4" /> Connect Bank Account
    </button>
  )
}

export function SettingsClient({ settings }: Props) {
  // PayPal
  const [paypal, setPaypal] = useState({
    client_id: settings.paypal_client_id ?? '',
    client_secret: settings.paypal_client_secret ?? '',
    mode: settings.paypal_mode ?? 'sandbox',
    webhook_id: settings.paypal_webhook_id ?? '',
  })
  const [paypalStatus, setPaypalStatus] = useState<Status>('idle')
  const [paypalMsg, setPaypalMsg] = useState('')
  const [savingPaypal, setSavingPaypal] = useState(false)

  // Wise
  const [wise, setWise] = useState({ api_token: settings.wise_api_token ?? '' })
  const [wiseStatus, setWiseStatus] = useState<Status>('idle')
  const [wiseMsg, setWiseMsg] = useState('')
  const [savingWise, setSavingWise] = useState(false)

  // Plaid
  const [plaid, setPlaid] = useState({
    client_id: settings.plaid_client_id ?? '',
    secret: settings.plaid_secret ?? '',
    environment: settings.plaid_environment ?? 'sandbox',
  })
  const [plaidStatus, setPlaidStatus] = useState<Status>(settings.plaid_access_token ? 'ok' : 'idle')
  const [plaidMsg, setPlaidMsg] = useState(settings.plaid_access_token ? 'Bank account linked' : '')
  const [savingPlaid, setSavingPlaid] = useState(false)
  const [linkToken, setLinkToken] = useState<string | null>(null)

  async function upsertSettings(pairs: Record<string, string>) {
    const res = await fetch('/api/integrations/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Failed to save')
    }
  }

  async function savePaypal() {
    setSavingPaypal(true)
    try {
      await upsertSettings({ paypal_client_id: paypal.client_id, paypal_client_secret: paypal.client_secret, paypal_mode: paypal.mode, paypal_webhook_id: paypal.webhook_id })
      toast.success('PayPal credentials saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSavingPaypal(false)
  }

  async function testPaypal() {
    setPaypalStatus('testing')
    try {
      const res = await fetch('/api/integrations/paypal/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: paypal.client_id, client_secret: paypal.client_secret, mode: paypal.mode }),
      })
      const json = await res.json()
      if (res.ok) { setPaypalStatus('ok'); setPaypalMsg(json.message || 'Connected') }
      else { setPaypalStatus('error'); setPaypalMsg(json.error || 'Connection failed') }
    } catch {
      setPaypalStatus('error'); setPaypalMsg('Network error')
    }
  }

  async function saveWise() {
    setSavingWise(true)
    try {
      await upsertSettings({ wise_api_token: wise.api_token })
      toast.success('Wise credentials saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSavingWise(false)
  }

  async function testWise() {
    setWiseStatus('testing')
    try {
      const res = await fetch('/api/integrations/wise/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_token: wise.api_token }),
      })
      const json = await res.json()
      if (res.ok) { setWiseStatus('ok'); setWiseMsg(json.message || 'Connected') }
      else { setWiseStatus('error'); setWiseMsg(json.error || 'Connection failed') }
    } catch {
      setWiseStatus('error'); setWiseMsg('Network error')
    }
  }

  async function savePlaid() {
    setSavingPlaid(true)
    try {
      await upsertSettings({ plaid_client_id: plaid.client_id, plaid_secret: plaid.secret, plaid_environment: plaid.environment })
      toast.success('Plaid credentials saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSavingPlaid(false)
  }

  async function openPlaidLink() {
    const res = await fetch('/api/integrations/plaid/create-link-token', { method: 'POST' })
    const json = await res.json()
    if (res.ok) setLinkToken(json.link_token)
    else toast.error(json.error || 'Failed to start Plaid Link')
  }

  async function onPlaidSuccess(publicToken: string, metadata: any) {
    setPlaidStatus('testing')
    const res = await fetch('/api/integrations/plaid/exchange-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken, institution: metadata?.institution?.name }),
    })
    const json = await res.json()
    if (res.ok) {
      setPlaidStatus('ok')
      setPlaidMsg(`${metadata?.institution?.name ?? 'Bank'} linked`)
      toast.success('Bank account connected!')
    } else {
      setPlaidStatus('error')
      setPlaidMsg(json.error || 'Failed to link account')
    }
    setLinkToken(null)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-[#F0F2F8] flex items-center gap-2">
          <Settings className="w-5 h-5" /> Settings
        </h1>
        <p className="text-[#8B91A8] text-sm mt-1">Connect your payment accounts to pull transactions for reconciliation</p>
      </div>

      {/* PayPal */}
      <SectionCard title="PayPal" description="Pull incoming payments from PayPal" status={paypalStatus}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#8B91A8] mb-1">Mode</label>
            <div className="flex gap-3">
              {(['live', 'sandbox'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPaypal(p => ({ ...p, mode: m }))}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${paypal.mode === m ? 'bg-[#00E5FF]/10 border-[#00E5FF]/40 text-[#00E5FF]' : 'border-[#2A2D3E] text-[#5A6080] hover:text-[#8B91A8]'}`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {paypal.mode === 'sandbox' && (
              <p className="text-[10px] text-[#8B91A8] mt-1.5">Sandbox uses fake test accounts from developer.paypal.com — safe for testing.</p>
            )}
            {paypal.mode === 'live' && (
              <p className="text-[10px] text-[#FFB547] mt-1.5">Live mode pulls real transactions. Switch to this when you&apos;re ready to use the company PayPal.</p>
            )}
          </div>
          <Input label="Client ID" value={paypal.client_id} onChange={e => setPaypal(p => ({ ...p, client_id: e.target.value }))} placeholder="AZ..." />
          <SecretInput label="Client Secret" name="paypal_secret" value={paypal.client_secret} onChange={v => setPaypal(p => ({ ...p, client_secret: v }))} />
          <div className="border-t border-[#2A2D3E] pt-3 space-y-2">
            <p className="text-xs font-medium text-[#8B91A8] uppercase tracking-wider">Webhook (Real-time payments)</p>
            <Input label="Webhook ID" value={paypal.webhook_id} onChange={e => setPaypal(p => ({ ...p, webhook_id: e.target.value }))} placeholder="From PayPal developer dashboard" />
            <div className="bg-[#0F1117] border border-[#2A2D3E] rounded-lg p-3 space-y-1.5 text-[10px] text-[#5A6080] leading-relaxed">
              <p className="text-[#8B91A8] font-medium">Setup steps:</p>
              <p>1. Go to <span className="text-[#F0F2F8]">developer.paypal.com</span> → your app → <span className="text-[#F0F2F8]">Webhooks</span> → Add Webhook</p>
              <p>2. Set URL to <span className="font-mono text-[#00E5FF] select-all">{typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/api/integrations/paypal/webhook</span></p>
              <p>3. Subscribe to: <span className="text-[#F0F2F8]">Payment sale completed</span> and <span className="text-[#F0F2F8]">Payment capture completed</span></p>
              <p>4. Copy the <span className="text-[#F0F2F8]">Webhook ID</span> shown after saving and paste it above</p>
              <p className="text-[#FFB547]">For local testing use ngrok: <span className="font-mono">ngrok http 3000</span> then use the ngrok URL above</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button onClick={savePaypal} disabled={savingPaypal} className="px-4 py-2 bg-[#00E5FF] text-[#0F1117] rounded-lg text-sm font-semibold hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50">
            {savingPaypal ? 'Saving…' : 'Save'}
          </button>
          <button onClick={testPaypal} disabled={paypalStatus === 'testing' || !paypal.client_id || !paypal.client_secret} className="px-4 py-2 border border-[#2A2D3E] text-[#8B91A8] rounded-lg text-sm hover:text-[#F0F2F8] transition-colors disabled:opacity-50">
            Test Connection
          </button>
          <StatusBadge status={paypalStatus} message={paypalMsg} />
        </div>
      </SectionCard>

      {/* Wise */}
      <SectionCard title="Wise" description="Pull transfers and balance transactions from Wise" status={wiseStatus}>
        <div className="space-y-3">
          <SecretInput label="API Token" name="wise_token" value={wise.api_token} onChange={v => setWise({ api_token: v })} />
          <p className="text-[10px] text-[#5A6080]">Get your token from Wise → Settings → API tokens. Read-only access is sufficient.</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button onClick={saveWise} disabled={savingWise} className="px-4 py-2 bg-[#00E5FF] text-[#0F1117] rounded-lg text-sm font-semibold hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50">
            {savingWise ? 'Saving…' : 'Save'}
          </button>
          <button onClick={testWise} disabled={wiseStatus === 'testing' || !wise.api_token} className="px-4 py-2 border border-[#2A2D3E] text-[#8B91A8] rounded-lg text-sm hover:text-[#F0F2F8] transition-colors disabled:opacity-50">
            Test Connection
          </button>
          <StatusBadge status={wiseStatus} message={wiseMsg} />
        </div>
      </SectionCard>

      {/* Plaid */}
      <SectionCard title="Plaid — Bluevine" description="Connect your Bluevine bank account via Plaid to pull transactions" status={plaidStatus}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client ID" value={plaid.client_id} onChange={e => setPlaid(p => ({ ...p, client_id: e.target.value }))} placeholder="From Plaid dashboard" />
            <div>
              <label className="block text-xs font-medium text-[#8B91A8] mb-1">Environment</label>
              <select
                value={plaid.environment}
                onChange={e => setPlaid(p => ({ ...p, environment: e.target.value }))}
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-3 py-2 text-sm text-[#F0F2F8] focus:outline-none focus:border-[#00E5FF]/50"
              >
                <option value="sandbox">Sandbox</option>
                <option value="development">Development</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
          <SecretInput label="Secret" name="plaid_secret" value={plaid.secret} onChange={v => setPlaid(p => ({ ...p, secret: v }))} />
          <p className="text-[10px] text-[#5A6080]">Get credentials from <span className="text-[#8B91A8]">dashboard.plaid.com</span>. Use Sandbox to test, then Production for real Bluevine data.</p>
        </div>
        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <button onClick={savePlaid} disabled={savingPlaid} className="px-4 py-2 bg-[#00E5FF] text-[#0F1117] rounded-lg text-sm font-semibold hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50">
            {savingPlaid ? 'Saving…' : 'Save'}
          </button>
          <button onClick={openPlaidLink} disabled={!plaid.client_id || !plaid.secret} className="flex items-center gap-2 px-4 py-2 border border-[#2A2D3E] text-[#8B91A8] rounded-lg text-sm hover:text-[#F0F2F8] transition-colors disabled:opacity-50">
            <Link2 className="w-3.5 h-3.5" /> Connect Bank Account
          </button>
          <StatusBadge status={plaidStatus} message={plaidMsg} />
        </div>
        <PlaidSection linkToken={linkToken} onSuccess={onPlaidSuccess} />
      </SectionCard>
    </div>
  )
}
