/** @type {import('next').NextConfig} */
const securityHeaders = [
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
