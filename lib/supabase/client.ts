import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (typeof document === 'undefined') return ''
          const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
          return match ? decodeURIComponent(match[2]) : ''
        },
        set(name: string, value: string, options: any) {
          if (typeof document === 'undefined') return
          
          // ⚡ THE FIX: We build the cookie string but intentionally IGNORE the maxAge/expires
          let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/`
          
          if (options.domain) cookieStr += `; domain=${options.domain}`
          if (options.secure) cookieStr += `; secure`
          if (options.sameSite) cookieStr += `; samesite=${options.sameSite}`
          
          // Notice how we DO NOT add options.maxAge here. 
          // This forces it to become a "Session Cookie" that dies on browser close!
          document.cookie = cookieStr
        },
        remove(name: string, options: any) {
          if (typeof document === 'undefined') return
          let cookieStr = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
          if (options.domain) cookieStr += `; domain=${options.domain}`
          document.cookie = cookieStr
        }
      }
    }
  )
}