import type { Metadata, Viewport } from 'next';
import { Readex_Pro } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import './globals.css';

const readex = Readex_Pro({ subsets: ['arabic', 'latin'], variable: '--font-readex', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'مِرقاة للرصد الذكي', template: '%s · مِرقاة' },
  description: 'نظام رصد الدرجات النهائية',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E8E8F0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={readex.variable}>
      <body className="font-sans">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
