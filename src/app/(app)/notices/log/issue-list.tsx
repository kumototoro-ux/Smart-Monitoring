'use client';
import { useCallback, useEffect, useState } from 'react';
import { FileDown, Image as ImageIcon, Share2, Archive, AlertTriangle } from 'lucide-react';
import { loadNoticeIssues, type IssueFilter, type IssueRow } from '@/app/actions/notices';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty';
import { fmtDateTime } from '@/lib/utils';

const KIND = { pdf: ['PDF', FileDown], png: ['صورة', ImageIcon], share: ['مشاركة', Share2], zip: ['ملف مضغوط', Archive] } as const;
const ROLE: Record<string, string> = { admin: 'أدمن', supervisor: 'مشرفة', teacher: 'مربية فصل' };

export function IssueList({ filter }: { filter: IssueFilter }) {
  const [rows, setRows] = useState<IssueRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(async (before?: string) => {
    setBusy(true);
    const r = await loadNoticeIssues({ ...filter, before });
    setBusy(false);
    if (!r.ok || !r.data) { setErr(r.message ?? 'تعذّر تحميل السجل'); return; }
    setErr(null);
    setRows((old) => (before ? [...(old ?? []), ...r.data!.rows] : r.data!.rows));
    setMore(r.data.more);
  }, [filter]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  if (err) return <div className="card"><EmptyState icon={<AlertTriangle className="h-6 w-6" />} title={err} /></div>;
  if (!rows) return <div className="card space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!rows.length) return <div className="card"><EmptyState title="لا توجد عمليات إصدار مسجّلة" hint="تظهر هنا كل مرة تنزّل فيها مربية فصل أو مشرفة إشعاراً أو تشاركه." /></div>;
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const [label, Icon] = KIND[r.kind] ?? KIND.pdf;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-[14px] font-medium">{r.student_name}</p>
                <p className="truncate text-[12.5px] text-ink-muted">{r.issuer_name ?? '—'}{r.issuer_role ? ` · ${ROLE[r.issuer_role] ?? r.issuer_role}` : ''}</p>
              </div>
              <Badge tone="neutral" icon={<Icon className="h-3.5 w-3.5" />}>{label}</Badge>
              {!r.complete && <Badge tone="warning">رصد ناقص</Badge>}
              <time className="num w-full text-[12px] text-ink-muted sm:w-auto" dateTime={r.created_at}>{fmtDateTime(r.created_at)}</time>
            </li>
          );
        })}
      </ul>
      {more && (
        <button onClick={() => void fetchPage(rows[rows.length - 1].created_at)} disabled={busy}
          className="w-full border-t border-line py-3 text-[13px] text-ink-soft hover:bg-surface disabled:opacity-60">{busy ? 'جارٍ التحميل…' : 'عرض المزيد'}</button>
      )}
    </div>
  );
}
