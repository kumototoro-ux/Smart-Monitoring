'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

/** زر تنزيل تقرير إكسل من /api/export مع إظهار الأخطاء بدل فتح صفحة فارغة */
export function ExportButton({ params, label = 'تصدير إكسل', className }: { params: Record<string, string | undefined>; label?: string; className?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
      const res = await fetch(`/api/export?${qs}`);
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'تعذّر التصدير'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'تقرير.xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success('تم تجهيز الملف', name);
    } catch { toast.error('تعذّر الاتصال بالخادم'); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={go} disabled={busy}
      className={cn('inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-[13px] font-medium hover:border-ink-faint disabled:opacity-60', className)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{label}
    </button>
  );
}
