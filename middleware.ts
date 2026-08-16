import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // manifest.json and sw.js must be excluded, not just for a nicer 404 -- a redirected
    // response for a service worker's top-level script fetch is rejected outright by the
    // browser per spec, so leaving these caught by the auth redirect silently broke push
    // registration even for logged-in users, not just anonymous visitors.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
