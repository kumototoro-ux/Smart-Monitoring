'use client';
import { startNavProgress } from '@/components/shell/nav-progress';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Plus, Upload, Pencil, GraduationCap, ChevronRight, ChevronLeft, CheckCheck, ArrowRightLeft, UserX, UserCheck, Trash2, Loader2 } from 'lucide-react';
import { saveStudent, moveStudents, setStudentsActive, approveStudents, deleteStudents } from '@/app/actions/students';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { ImportDialog } from './import-dialog';
import { cn } from '@/lib/utils';
import type { Branch, Grade, Section, Student } from '@/lib/types';

interface Props {
  isAdmin: boolean; myBranch: string | null;
  filters: { branch: string; grade: string; section: string; q: string; flag: string };
  students: Student[]; total: number; page: number; pageSize: number; reviewCount: number;
  branches: Branch[]; grades: Grade[]; sections: Section[];
}
type Edit = Partial<Student> & { branch_id: string; grade_id: string };

export function StudentsClient(p: Props) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(p.filters.q);
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { exec, busy } = useAction();

  const bName = useMemo(() => new Map(p.branches.map((b) => [b.id, b.name])), [p.branches]);
  const gName = useMemo(() => new Map(p.grades.map((g) => [g.id, g.name])), [p.grades]);
  const sName = useMemo(() => new Map(p.sections.map((s) => [s.id, s.name])), [p.sections]);

  const nav = (patch: Partial<Props['filters']> & { page?: number }) => {
    const f = { ...p.filters, page: 1, ...patch } as Record<string, string | number>;
    if (patch.grade !== undefined && patch.section === undefined) f.section = '';
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 1 || false).map(([k, v]) => [k, String(v)]));
    setSel([]);
    startNavProgress(); start(() => router.push(`${path}?${qs}`));
  };

  // بحث بعد التوقف عن الكتابة
  useEffect(() => {
    if (q === p.filters.q) return;
    const t = setTimeout(() => nav({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const allSel = p.students.length > 0 && p.students.every((s) => sel.includes(s.id));
  const sectionsFor = (b: string, g: string) => p.sections.filter((s) => s.branch_id === b && s.grade_id === g);
  const selStudents = p.students.filter((s) => sel.includes(s.id));
  const sameGroup = selStudents.length > 0 && selStudents.every((s) => s.branch_id === selStudents[0].branch_id && s.grade_id === selStudents[0].grade_id);

  return (
    <>
      {p.reviewCount > 0 && p.filters.flag !== 'review' && (
        <button onClick={() => nav({ flag: 'review' })} className="mb-4 flex w-full items-center gap-3 rounded-card bg-amber-soft p-4 text-right text-[13.5px] text-amber">
          <span className="num grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 font-semibold">{p.reviewCount}</span>
          طالب أضافته المعلمات يحتاج مراجعة بياناته
          <ChevronLeft className="mr-auto h-4 w-4" />
        </button>
      )}

      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو رقم الهوية أو رقم الطالب" className="pr-10" />
            {pending && <Loader2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {p.isAdmin && (
              <Select value={p.filters.branch} onChange={(e) => nav({ branch: e.target.value, section: '' })} className="sm:w-40">
                <option value="">كل الفروع</option>
                {p.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
            <Select value={p.filters.grade} onChange={(e) => nav({ grade: e.target.value })} className="sm:w-44">
              <option value="">كل الصفوف</option>
              {p.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {p.filters.grade && (
              <Select value={p.filters.section} onChange={(e) => nav({ section: e.target.value })} className="sm:w-32">
                <option value="">كل الشعب</option>
                {p.sections.filter((s) => s.grade_id === p.filters.grade && (!p.filters.branch || s.branch_id === p.filters.branch)).map((s) => (
                  <option key={s.id} value={s.id}>{p.filters.branch ? `شعبة ${s.name}` : `${bName.get(s.branch_id)} · ${s.name}`}</option>
                ))}
              </Select>
            )}
            <Select value={p.filters.flag} onChange={(e) => nav({ flag: e.target.value })} className="sm:w-44">
              <option value="">النشطون</option>
              <option value="review">بحاجة لمراجعة</option>
              <option value="nosection">بدون شعبة</option>
              <option value="inactive">الموقوفون</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />استيراد إكسل</Button>
            <Button onClick={() => setEdit({ branch_id: p.filters.branch || p.myBranch || p.branches[0]?.id || '', grade_id: p.filters.grade || p.grades[0]?.id || '', section_id: p.filters.section || null })}>
              <Plus className="h-4 w-4" />طالب
            </Button>
          </div>
        </div>
      </div>

      {sel.length > 0 && (
        <div className="sticky top-[72px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-card bg-black p-3 text-white shadow-pop lg:top-[92px]">
          <span className="num px-2 text-[13.5px]">تم تحديد {sel.length}</span>
          {sameGroup && <Button size="sm" variant="secondary" onClick={() => setMoveTo('')}><ArrowRightLeft className="h-4 w-4" />نقل لشعبة</Button>}
          {p.filters.flag === 'review' && <Button size="sm" variant="secondary" onClick={() => exec(() => approveStudents(sel), { success: (n) => `تم اعتماد ${n} طالب` }).then(() => setSel([]))}><CheckCheck className="h-4 w-4" />اعتماد البيانات</Button>}
          {p.filters.flag === 'inactive'
            ? <Button size="sm" variant="secondary" onClick={() => exec(() => setStudentsActive(sel, true), { success: 'تم التفعيل' }).then(() => setSel([]))}><UserCheck className="h-4 w-4" />تفعيل</Button>
            : <Button size="sm" variant="secondary" onClick={() => exec(() => setStudentsActive(sel, false), {
                success: (n) => `تم إيقاف ${n} طالب`,
                confirm: { title: 'إيقاف الطلاب', tone: 'danger', confirmText: 'إيقاف', message: `لن يظهر ${sel.length} طالب في كشوفات الرصد. درجاتهم السابقة تبقى محفوظة.` },
              }).then(() => setSel([]))}><UserX className="h-4 w-4" />إيقاف</Button>}
          {p.isAdmin && <Button size="sm" variant="danger" onClick={() => exec(() => deleteStudents(sel), {
            success: (n) => `تم حذف ${n} طالب`,
            confirm: { title: 'حذف نهائي', tone: 'danger', confirmText: 'حذف', message: `سيتم حذف ${sel.length} طالب نهائياً. لا يمكن حذف طالب له رصد.` },
          }).then(() => setSel([]))}><Trash2 className="h-4 w-4" />حذف</Button>}
          <button onClick={() => setSel([])} className="mr-auto px-2 text-[13px] text-white/70 hover:text-white">إلغاء التحديد</button>
        </div>
      )}

      <div className={cn('card overflow-hidden transition-opacity', pending && 'opacity-60')}>
        {p.students.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="لا يوجد طلاب" hint="غيّري الفلاتر أو استوردي ملف الطلاب من إكسل."
            action={<Button variant="secondary" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />استيراد إكسل</Button>} />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3 text-[12.5px] text-ink-muted">
              <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? [] : p.students.map((s) => s.id))} className="h-4 w-4 accent-black" aria-label="تحديد الكل" />
              <span className="num">{p.total.toLocaleString('en')} طالب</span>
            </div>
            <ul className="divide-y divide-line">
              {p.students.map((s) => (
                <li key={s.id} className={cn('flex items-center gap-3 px-5 py-3', sel.includes(s.id) && 'bg-peri-soft/50')}>
                  <input type="checkbox" checked={sel.includes(s.id)} onChange={() => setSel((l) => l.includes(s.id) ? l.filter((x) => x !== s.id) : [...l, s.id])} className="h-4 w-4 shrink-0 accent-black" aria-label={s.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{s.full_name}</p>
                    <p className="truncate text-[12.5px] text-ink-muted">
                      {gName.get(s.grade_id)}{s.section_id ? ` · شعبة ${sName.get(s.section_id) ?? ''}` : ''}{p.isAdmin && !p.filters.branch ? ` · ${bName.get(s.branch_id)}` : ''}
                    </p>
                  </div>
                  <span className="num hidden w-28 text-[12.5px] text-ink-muted md:block" dir="ltr">{s.national_id ?? '—'}</span>
                  {!s.section_id && <Badge tone="warning">بدون شعبة</Badge>}
                  {s.needs_review && <Badge tone="info">أضافته معلمة</Badge>}
                  <button onClick={() => setEdit(s as Edit)} className="rounded-full p-2 text-ink-muted hover:bg-surface hover:text-ink" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <Button size="sm" variant="secondary" disabled={p.page <= 1} onClick={() => nav({ page: p.page - 1 })}><ChevronRight className="h-4 w-4" />السابق</Button>
                <span className="num text-[13px] text-ink-muted">صفحة {p.page} من {pages}</span>
                <Button size="sm" variant="secondary" disabled={p.page >= pages} onClick={() => nav({ page: p.page + 1 })}>التالي<ChevronLeft className="h-4 w-4" /></Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل بيانات الطالب' : 'طالب جديد'}
        footer={<>
          <Button loading={busy} onClick={async () => {
            if (!edit) return;
            const r = await exec(() => saveStudent({
              id: edit.id, full_name: edit.full_name ?? '', national_id: edit.national_id ?? '', student_number: edit.student_number ?? '',
              gender: edit.gender ?? null, branch_id: edit.branch_id, grade_id: edit.grade_id, section_id: edit.section_id || null,
            }), { success: 'تم حفظ بيانات الطالب' });
            if (r?.ok) setEdit(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        {edit && (
          <div className="space-y-4">
            <Field label="اسم الطالب"><Input value={edit.full_name ?? ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} placeholder="الاسم رباعياً" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="رقم الهوية"><Input value={edit.national_id ?? ''} onChange={(e) => setEdit({ ...edit, national_id: e.target.value })} inputMode="numeric" dir="ltr" className="text-right" /></Field>
              <Field label="رقم الطالب"><Input value={edit.student_number ?? ''} onChange={(e) => setEdit({ ...edit, student_number: e.target.value })} dir="ltr" className="text-right" /></Field>
            </div>
            <Field label="الجنس">
              <Select value={edit.gender ?? ''} onChange={(e) => setEdit({ ...edit, gender: (e.target.value || null) as Student['gender'] })}>
                <option value="">غير محدد</option>
                <option value="male">طالب</option>
                <option value="female">طالبة</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {p.isAdmin && (
                <Field label="الفرع" className="col-span-2">
                  <Select value={edit.branch_id} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value, section_id: null })}>
                    {p.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="الصف">
                <Select value={edit.grade_id} onChange={(e) => setEdit({ ...edit, grade_id: e.target.value, section_id: null })}>
                  {p.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </Field>
              <Field label="الشعبة">
                <Select value={edit.section_id ?? ''} onChange={(e) => setEdit({ ...edit, section_id: e.target.value || null })}>
                  <option value="">بدون شعبة</option>
                  {sectionsFor(edit.branch_id, edit.grade_id).map((s) => <option key={s.id} value={s.id}>شعبة {s.name}</option>)}
                </Select>
              </Field>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={moveTo !== null} onClose={() => setMoveTo(null)} title="نقل الطلاب لشعبة" description={`${sel.length} طالب`}
        footer={<>
          <Button loading={busy} disabled={!moveTo} onClick={async () => {
            const r = await exec(() => moveStudents(sel, moveTo!), { success: (n) => `تم نقل ${n} طالب` });
            if (r?.ok) { setMoveTo(null); setSel([]); }
          }}>نقل</Button>
          <Button variant="secondary" onClick={() => setMoveTo(null)}>إلغاء</Button>
        </>}>
        <Select value={moveTo ?? ''} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">اختاري الشعبة</option>
          {selStudents[0] && sectionsFor(selStudents[0].branch_id, selStudents[0].grade_id).map((s) => <option key={s.id} value={s.id}>شعبة {s.name}</option>)}
        </Select>
      </Dialog>

      <ImportDialog open={importing} onClose={() => setImporting(false)} isAdmin={p.isAdmin} branches={p.branches} defaultBranch={p.filters.branch || p.myBranch} />
    </>
  );
}
