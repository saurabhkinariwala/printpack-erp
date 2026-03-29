"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Lock, User as UserIcon, AlertCircle, Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  
  // Changed from email to username
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // THE SMART TRICK: Handle both short usernames AND full emails
    let loginEmail = username.trim().toLowerCase();
    
    // Dynamically pull the domain from Vercel, fallback to printpack.com just in case
    const authDomain = process.env.NEXT_PUBLIC_AUTH_DOMAIN || "printpack.com";

    // If they didn't type an '@', automatically attach the correct company domain
    if (!loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@${authDomain}`;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })

    if (signInError) {
      const cleanMessage = signInError.message.includes("email") 
        ? "Invalid username or password" 
        : signInError.message;
        
      setError(cleanMessage)
      setIsLoading(false)
    } else {
      router.push('/orders') 
      router.refresh()
    }
  }

  // Dynamically pull the company name for the logo header
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "ERP SYSTEM";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
        <div className="bg-slate-900 p-8 text-center">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Lock className="w-6 h-6 text-white" />
          </div>
          {/* Dynamic Company Header */}
          <h1 className="text-2xl font-black text-white tracking-wide uppercase">
            {companyName}
          </h1>
          <p className="text-slate-400 text-sm mt-2">Secure Employee Portal</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Username / Employee ID</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-medium transition-all"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-medium transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Authenticating...</> : "Secure Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}