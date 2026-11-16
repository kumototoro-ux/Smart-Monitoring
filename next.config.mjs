/** @type {import('next').NextConfig} */
// سياسة أمان المحتوى: لا سكربتات خارجية، لا تضمين في إطارات، والاتصال لخادمنا وSupabase فقط
const supa = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch { return 'https://*.supabase.co'; } })();
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supa}`,
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${supa} ${supa.replace(/^http/, 'ws')}${dev ? ' ws: http:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs'],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
    // الرجوع لصفحة زرتِها خلال 30 ثانية يظهر فوراً من الذاكرة (أي حفظ يحدّثها تلقائياً)
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
