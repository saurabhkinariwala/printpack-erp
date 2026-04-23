import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const { maxAge, ...sessionOptions } = options;
              cookieStore.set(name, value, sessionOptions)
            }
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be safely ignored as we handle session refreshes via middleware.
          }
        },
      },
    }
  )
}