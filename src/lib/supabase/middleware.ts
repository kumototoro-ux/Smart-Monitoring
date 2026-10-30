import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC = ['/login'];

export async function updateSession(request: NextRequest) {
  request.headers.set('x-pathname', request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims: يتحقق من توقيع الجلسة محلياً (بدون رحلة للخادم مع مفاتيح التوقيع الحديثة)،
  // ويجدد الجلسة عند قرب انتهائها. أسرع بكثير من getUser في كل تنقل.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return response;
}
