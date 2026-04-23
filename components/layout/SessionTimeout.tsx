"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function SessionTimeout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleLogout = async () => {
    // 1. Sign out of Supabase
    await supabase.auth.signOut()
    // 2. Alert the user
    alert("You have been logged out due to 10 minutes of inactivity.")
    // 3. Redirect to login
    router.push("/login") // Change this if your login page has a different URL
  }

  const resetTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // 10 minutes = 10 * 60 * 1000 = 600,000 milliseconds
    timeoutRef.current = setTimeout(handleLogout, 600000)
  }

  useEffect(() => {
    // Don't run the timeout timer if they are already on the login page!
    if (pathname === "/login") return

    // List of human activities that prove the user is still there
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"]
    
    // Reset the timer whenever any of these happen
    const activityHandler = () => resetTimer()

    events.forEach(event => window.addEventListener(event, activityHandler))
    
    // Start the timer when the component mounts
    resetTimer()

    // Cleanup listeners if the component unmounts
    return () => {
      events.forEach(event => window.removeEventListener(event, activityHandler))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [pathname])

  return <>{children}</>
}