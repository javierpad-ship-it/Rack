import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresca la sesión y protege las rutas del dashboard.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si faltan las variables, no reventar con 500: dejar pasar al login,
  // que mostrará un estado degradado en vez de tirar la app entera.
  if (!url || !anonKey) {
    const path = request.nextUrl.pathname;
    if (!path.startsWith('/login')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isAuthRoute = path.startsWith('/login');

    if (!user && !isAuthRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user && isAuthRoute) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
  } catch {
    // Ante cualquier fallo del cliente Supabase, no tumbar la app:
    // mandar al login en vez de devolver 500.
    const path = request.nextUrl.pathname;
    if (!path.startsWith('/login')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|privacidad|.*\\.(?:svg|png|jpg|jpeg)$).*)'],
};
