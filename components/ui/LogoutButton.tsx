"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LogOut } from "lucide-react"

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    // 1. Destroy the secure session in Supabase
    await supabase.auth.signOut()
    
    // 2. Push the user to the login page
    router.push('/login')
    
    // 3. Force Next.js to refresh so the Middleware instantly locks the app
    router.refresh() 
  }

  return (
    <button 
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full"
    >
      <LogOut className="w-5 h-5" />
      <span>Secure Logout</span>
    </button>
  )
}