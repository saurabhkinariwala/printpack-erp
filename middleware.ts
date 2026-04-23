import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          
          supabaseResponse = NextResponse.next({ request })
          
          cookiesToSet.forEach(({ name, value, options }) => {
            // ⚡ THE FIX: Strip maxAge from the options before setting the response cookie
            const { maxAge, ...sessionOptions } = options;
            
            supabaseResponse.cookies.set(name, value, sessionOptions);
          })
        },
      },
    }
  )

  // SECURE CHECK: Verify the user session directly with the Supabase Auth server
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')

  // If the user is NOT logged in and trying to access a protected route (like /orders)
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If the user IS logged in but tries to go to the login page, push them to the dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/orders' // Change this to your main dashboard page if different
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Only run middleware on app routes, ignore static files and images
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}