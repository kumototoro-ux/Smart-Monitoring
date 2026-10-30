'use client';
import { startNavProgress } from '@/components/shell/nav-progress';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Download, Eye, CheckCircle2, Circle, Users, Loader2, BarChart3, Building2 } from 'lucide-react';
import { loadSheet, type SheetData } from '@/app/actions/grading';
import { SheetEditor } from '@/components/sheet/sheet-editor';
import { SheetSkeleton } from '../grading/grading-client';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty';
import { Ring } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { cn, fmtDateTime, scrollAppTop, secLabel } from '@/lib/utils';
import type { Branch, Grade, Section } from '@/lib/types';

export interface SubjectStatus { id: string; name: string; teachers: string[]; comps: { id: string; name: string; at: string | null; by: string | null }[] }

export function ResultsClient({ role, branches, grades, sections, filters, status, studentCount }: {
  role: 'admin' | 'supervisor'; branches: Branch[]; grades: Grade[]; sections: Section[];
  filters: { branch: string; grade: string; section: string; term: 1 | 2 }; status: SubjectStatus[]; studentCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const nav = (patch: Partial<typeof filters>) => {
    const f = { ...filters, ...patch };
    if (patch.branch) { f.grade = ''; f.section = ''; }
    if (patch.grade) f.section = '';
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    startNavProgress(); start(() => router.push(`/results?${qs}`));
  };

  const open = async (gsId: string) => {
    setOpening(gsId);
    const r = await loadSheet(filters.section, gsId, filters.term);
    setOpening(null);
    if (r.ok && r.data) { setSheet(r.data); scrollAppTop(false); }
    else toast.error(r.message ?? 'تعذّر فتح الكشف');
  };

  /** تحميل الملف مع إظهار الأخطاء بدل فتح صفحة فارغة */
  const download = async (key: string, qs: Record<string, string>) => {
    setDownloading(key);
    try {
      const res = await fetch(`/api/export?${new URLSearchParams({ term: String(filters.term), ...qs })}`);
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'تعذّر التصدير'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'كشف.xlsx');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success('تم تجهيز الملف', name);
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally { setDownloading(null); }
  };

  if (sheet) return <SheetEditor initial={sheet} scope="all" role={role} onBack={() => { setSheet(null); router.refresh(); }} />;
  if (opening && !sheet) return <SheetSkeleton />;

  const total = status.reduce((a, s) => a + s.comps.length, 0);
  const done = status.reduce((a, s) => a + s.comps.filter((c) => c.at).length, 0);
  const secs = sections.filter((s) => s.grade_id === filters.grade);

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {role === 'admin' && (
            <Select value={filters.branch} onChange={(e) => nav({ branch: e.target.value })} className="sm:w-44">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <Select value={filters.grade} onChange={(e) => nav({ grade: e.target.value })} className="sm:w-48">
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select value={String(filters.term)} onChange={(e) => nav({ term: Number(e.target.value) as 1 | 2 })} className="sm:w-36">
            <option value="1">الترم الأول</option><option value="2">الترم الثاني</option>
          </Select>
          {pending && <Loader2 className="h-5 w-5 animate-spin self-center text-ink-muted" />}
          <div className="col-span-2 flex flex-wrap gap-2 sm:mr-auto">
            <Button variant="secondary" size="sm" loading={downloading === 'branch'} onClick={() => download('branch', { type: 'branch', branch: filters.branch, grade: filters.grade })}>
              <Building2 className="h-4 w-4" />كل شعب الصف
            </Button>
            <Button variant="secondary" size="sm" loading={downloading === 'progress'} onClick={() => download('progress', { type: 'progress', branch: filters.branch })}>
              <BarChart3 className="h-4 w-4" />تقرير متابعة الرصد
            </Button>
          </div>
        </div>
        {secs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {secs.map((s) => (
              <button key={s.id} onClick={() => nav({ section: s.id })}
                className={cn('rounded-full border px-4 py-2 text-[13.5px] transition', filters.section === s.id ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft')}>
                {secLabel(s.name)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!filters.section ? (
        <div className="card"><EmptyState icon={<FileSpreadsheet className="h-6 w-6" />} title="لا توجد شعب لهذا الصف" /></div>
      ) : (
        <div className={cn('transition-opacity', pending && 'opacity-60')}>
          <div className="card mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <Ring value={total ? (done / total) * 100 : 0} size={52} />
            <div className="flex-1">
              <p className="num text-[16px] font-semibold">{done} من {total} تقييم مرصود</p>
              <p className="flex items-center gap-1.5 text-[13px] text-ink-muted"><Users className="h-4 w-4" /><span className="num">{studentCount}</span> طالب في الشعبة</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button loading={downloading === 'section'} onClick={() => download('section', { type: 'section', section: filters.section, detailed: '1' })}>
                <Download className="h-4 w-4" />كشف الشعبة تفصيلي
              </Button>
              <Button variant="secondary" loading={downloading === 'section0'} onClick={() => download('section0', { type: 'section', section: filters.section, detailed: '0' })}>
                مختصر
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {status.map((s) => {
              const n = s.comps.filter((c) => c.at).length;
              const last = s.comps.filter((c) => c.at).sort((a, b) => (b.at! > a.at! ? 1 : -1))[0];
              return (
                <div key={s.id} className="card flex flex-col p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold">{s.name}</p>
                      <p className={cn('truncate text-[12.5px]', s.teachers.length ? 'text-ink-muted' : 'text-rose')}>{s.teachers.length ? s.teachers.join('، ') : 'بلا معلمة'}</p>
                    </div>
                    <span className={cn('num shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium',
                      n === s.comps.length ? 'bg-mint-soft text-mint' : n ? 'bg-peri-soft text-peri-deep' : 'bg-rose-soft text-rose')}>{n}/{s.comps.length}</span>
                  </div>
                  <ul className="mb-3 space-y-1">
                    {s.comps.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
                        {c.at ? <CheckCircle2 className="h-3.5 w-3.5 text-mint" /> : <Circle className="h-3.5 w-3.5 text-ink-faint" />}
                        <span className={c.at ? 'text-ink' : 'text-ink-muted'}>{c.name}</span>
                      </li>
                    ))}
                  </ul>
                  {last && <p className="mb-3 text-[11.5px] text-ink-muted">آخر حفظ {fmtDateTime(last.at)}{last.by ? ` · ${last.by}` : ''}</p>}
                  <div className="mt-auto flex gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="soft" loading={opening === s.id} onClick={() => open(s.id)}><Eye className="h-4 w-4" />{role === 'admin' ? 'عرض وتعديل' : 'عرض'}</Button>
                    <Button size="sm" variant="ghost" loading={downloading === s.id} onClick={() => download(s.id, { type: 'subject', section: filters.section, subject: s.id })}><Download className="h-4 w-4" />إكسل</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
