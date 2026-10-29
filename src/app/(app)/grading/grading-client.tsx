'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Layers, Users, BookOpen, ListChecks, ArrowLeft, CheckCircle2, Lock, ClipboardPen } from 'lucide-react';
import type { TeacherSheet } from '@/lib/teacher';
import { loadSheet, type SheetData } from '@/app/actions/grading';
import { SheetEditor } from '@/components/sheet/sheet-editor';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { cn, scrollAppTop } from '@/lib/utils';

export function GradingClient({ sheets, gradingOpen, preset }: { sheets: TeacherSheet[]; gradingOpen: boolean; preset: { section?: string; subject?: string } }) {
  const router = useRouter();
  const toast = useToast();
  const grades = useMemo(() => [...new Map(sheets.map((s) => [s.grade_id, { id: s.grade_id, name: s.grade_name }])).values()], [sheets]);
  const presetSheet = sheets.find((s) => s.section_id === preset.section && s.grade_subject_id === preset.subject);

  const [gradeId, setGradeId] = useState(presetSheet?.grade_id ?? (grades.length === 1 ? grades[0].id : ''));
  const sections = useMemo(() => [...new Map(sheets.filter((s) => s.grade_id === gradeId).map((s) => [s.section_id, { id: s.section_id, name: s.section_name }])).values()], [sheets, gradeId]);
  const [sectionId, setSectionId] = useState(presetSheet?.section_id ?? '');
  const subjects = useMemo(() => sheets.filter((s) => s.section_id === sectionId), [sheets, sectionId]);
  const [subjectId, setSubjectId] = useState(presetSheet?.grade_subject_id ?? '');
  const sheet = subjects.find((s) => s.grade_subject_id === subjectId);
  const [scope, setScope] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ d: SheetData; scope: string[] | 'all' } | null>(null);

  // اختيار تلقائي عند وجود خيار واحد فقط
  useEffect(() => { if (sections.length === 1) setSectionId(sections[0].id); else if (!sections.some((s) => s.id === sectionId)) setSectionId(''); }, [sections]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (subjects.length === 1) setSubjectId(subjects[0].grade_subject_id); else if (!subjects.some((s) => s.grade_subject_id === subjectId)) setSubjectId(''); }, [subjects]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setScope('all'); }, [subjectId]);

  const open = async () => {
    if (!sheet) return;
    setLoading(true);
    const r = await loadSheet(sheet.section_id, sheet.grade_subject_id);
    setLoading(false);
    if (r.ok && r.data) {
      setData({ d: r.data, scope: scope === 'all' ? 'all' : [scope] });
      scrollAppTop(false);
    } else toast.error(r.message ?? 'تعذّر فتح الكشف');
  };

  useEffect(() => { if (presetSheet) void open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (data) {
    return <SheetEditor key={data.d.meta.section_id + data.d.meta.grade_subject_id + String(data.scope)} initial={data.d} scope={data.scope} role="teacher"
      onBack={() => { setData(null); router.replace('/grading'); router.refresh(); }} />;
  }
  if (loading && presetSheet) return <SheetSkeleton />;

  if (!sheets.length) {
    return (
      <div>
        <PageHeader title="رصد الدرجات" />
        <div className="card"><EmptyState icon={<ClipboardPen className="h-6 w-6" />} title="لم تُسند لك أي مادة بعد" hint="تواصلي مع مشرفة الفرع لإسناد الصفوف والمواد." /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="رصد الدرجات" subtitle="اختاري الكشف الذي تريدين رصده" />
      {!gradingOpen && (
        <div className="mb-4 flex items-center gap-3 rounded-card bg-rose-soft px-4 py-3 text-[13.5px] text-rose">
          <Lock className="h-4 w-4" />الرصد مغلق حالياً من الإدارة. يمكنك فتح الكشوفات للاطلاع فقط.
        </div>
      )}
      <div className="space-y-3">
        {grades.length > 1 && (
          <Step icon={<Layers />} title="الصف" done={!!gradeId}>
            <Chips items={grades.map((g) => ({ id: g.id, label: g.name }))} value={gradeId} onChange={(v) => { setGradeId(v); setSectionId(''); setSubjectId(''); }} />
          </Step>
        )}
        <AnimatePresence>
          {gradeId && sections.length > 1 && (
            <Step key="sec" icon={<Users />} title="الشعبة" done={!!sectionId}>
              <Chips items={sections.map((s) => ({ id: s.id, label: `شعبة ${s.name}` }))} value={sectionId} onChange={(v) => { setSectionId(v); setSubjectId(''); }} />
            </Step>
          )}
          {sectionId && subjects.length > 1 && (
            <Step key="sub" icon={<BookOpen />} title="المادة" done={!!subjectId}>
              <Chips items={subjects.map((s) => ({ id: s.grade_subject_id, label: s.subject_name, done: s.components.every((c) => c.submission) }))} value={subjectId} onChange={setSubjectId} />
            </Step>
          )}
          {sheet && sheet.components.length > 1 && (
            <Step key="scope" icon={<ListChecks />} title="التقييمات" done>
              <Chips
                items={[{ id: 'all', label: 'كل التقييمات' }, ...sheet.components.map((c) => ({ id: c.id, label: `${c.name}${c.max_score ? ` (${c.max_score})` : ''}`, done: !!c.submission }))]}
                value={scope} onChange={setScope} />
            </Step>
          )}
        </AnimatePresence>

        {sheet && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-[16px] font-semibold">{sheet.subject_name}</p>
              <p className="text-[13px] text-ink-muted">{sheet.grade_name} · شعبة {sheet.section_name} · {scope === 'all' ? 'كل التقييمات' : sheet.components.find((c) => c.id === scope)?.name}</p>
            </div>
            <Button size="lg" onClick={open} loading={loading}>عرض الكشف <ArrowLeft className="h-4 w-4" /></Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Step({ icon, title, done, children }: { icon: React.ReactElement<{ className?: string }>; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn('grid h-8 w-8 place-items-center rounded-full transition [&>svg]:h-4 [&>svg]:w-4', done ? 'bg-black text-white' : 'bg-surface text-ink-muted')}>{icon}</span>
        <p className="text-[14.5px] font-medium">{title}</p>
      </div>
      {children}
    </motion.section>
  );
}

function Chips({ items, value, onChange }: { items: { id: string; label: string; done?: boolean }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button key={i.id} onClick={() => onChange(i.id)}
          className={cn('inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[14px] transition active:scale-[.98]',
            value === i.id ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>
          {i.done && <CheckCircle2 className={cn('h-4 w-4', value === i.id ? 'text-white' : 'text-mint')} />}
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function SheetSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-card" />
      <div className="card space-y-3 p-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3"><Skeleton className="h-10 w-8" /><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-16" /><Skeleton className="h-10 w-16" /><Skeleton className="h-10 w-16" /></div>
        ))}
      </div>
    </div>
  );
}
