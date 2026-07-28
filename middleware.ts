import { type NextRequest, NextResponse } from 'next/server'
import { ARENA_EMAIL_COOKIE_NAME } from '@/lib/arena-email-constants'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const frameHeaders = {
    'Content-Security-Policy': 'frame-ancestors *',
  } as const

  if (pathname === '/access-denied' || pathname.startsWith('/access-denied/')) {
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
    return response
  }

  const fromQuery = request.nextUrl.searchParams.get('emailId')?.trim() ?? ''
  const fromCookie = request.cookies.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim() ?? ''
  const emailId = fromQuery || fromCookie

  if (!emailId) {
    const deniedUrl = request.nextUrl.clone()
    deniedUrl.pathname = '/access-denied'
    deniedUrl.search = ''
    const response = NextResponse.rewrite(deniedUrl)
    response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
    return response
  }

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])

  if (fromQuery) {
    response.cookies.set(ARENA_EMAIL_COOKIE_NAME, fromQuery, {
      path: '/',
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
