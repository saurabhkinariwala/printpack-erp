"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type AuthContextType = {
  user: any;
  profile: any;
  permissions: Record<string, boolean>;
  hasPermission: (key: string) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    async function loadAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setIsLoading(false)
        return
      }
      
      setUser(session.user)

      // ⚡ FIX: Added 'name' so profile.roles.name is populated!
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, roles(name, permissions)') 
        .eq('id', session.user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        // Extract the JSONB permissions safely
        setPermissions(profileData.roles?.permissions || {})
      }
      
      setIsLoading(false)
    }
    
    loadAuth()
  }, [supabase])

  // THE MAGIC FUNCTION: Ask this if a user can do something
  const hasPermission = (key: string) => {
    return !!permissions[key]
  }

  return (
    <AuthContext.Provider value={{ user, profile, permissions, hasPermission, isLoading }}>
      {!isLoading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider")
  return context
}