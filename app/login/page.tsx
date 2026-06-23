'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#00E5FF] flex items-center justify-center">
            <span className="text-[#0F1117] font-black text-sm">TSP</span>
          </div>
          <div>
            <p className="text-[#F0F2F8] font-semibold">TSP Talent</p>
            <p className="text-[#5A6080] text-xs">Ops System</p>
          </div>
        </div>

        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-xl p-6">
          <h1 className="text-lg font-semibold text-[#F0F2F8] mb-1">Sign in</h1>
          <p className="text-[#8B91A8] text-sm mb-6">Access the TSP operations platform</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tsptalent.co"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button type="submit" loading={loading} className="w-full justify-center" size="lg">
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
