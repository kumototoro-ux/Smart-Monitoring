'use client';
import { startNavProgress } from '@/components/shell/nav-progress';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, X, Users, AlertTriangle, ArrowLeftRight, Link2 } from 'lucide-react';
import { addAssignments, removeAssignment, transferAssignments } from '@/app/actions/assignments';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/shell/shell';
import { ChipPicker } from '../settings/subjects/subjects-client';
import { cn } from '@/lib/utils';
import type { Branch, Grade, Section } from '@/lib/types';

interface A { id: string; teacher_id: string; section_id: string; grade_subject_id: string }
interface Props {
  isAdmin: boolean; branches: Branch[]; branchId: string;
  teachers: { id: string; full_name: string; username: string }[];
  grades: Grade[]; sections: Section[];
  gradeSubjects: { id: string; grade_id: string; name: string }[];
  assignments: A[];
}

export function AssignmentsClient(p: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(p.teachers[0]?.id ?? null);
  const [view, setView] = useState<'teachers' | 'gaps'>('teachers');
  const [adding, setAdding] = useState(false);
  const [gradeId, setGradeId] = useState('');
  const [secs, setSecs] = useState<string[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const { exec, busy } = useAction();

  const secMap = useMemo(() => new Map(p.sections.map((s) => [s.id, s])), [p.sections]);
  const gsMap = useMemo(() => new Map(p.gradeSubjects.map((g) => [g.id, g])), [p.gradeSubjects]);
  const gradeMap = useMemo(() => new Map(p.grades.map((g) => [g.id, g])), [p.grades]);
  const tMap = useMemo(() => new Map(p.teachers.map((t) => [t.id, t])), [p.teachers]);
  const countBy = useMemo(() => {
    const m: Record<string, number> = {};
    p.assignments.forEach((a) => (m[a.teacher_id] = (m[a.teacher_id] ?? 0) + 1));
    return m;
  }, [p.assignments]);

  const teachers = p.teachers.filter((t) => !q || t.full_name.includes(q) || t.username.includes(q.toLowerCase()));
  const mine = p.assignments.filter((a) => a.teacher_id === sel);
  const teacher = sel ? tMap.get(sel) : null;

  // التجميع: صف → مادة → شعب
  const grouped = useMemo(() => {
    const g = new Map<string, Map<string, A[]>>();
    mine.forEach((a) => {
      const sec = secMap.get(a.section_id); if (!sec) return;
      if (!g.has(sec.grade_id)) g.set(sec.grade_id, new Map());
      const m = g.get(sec.grade_id)!;
      if (!m.has(a.grade_subject_id)) m.set(a.grade_subject_id, []);
      m.get(a.grade_subject_id)!.push(a);
    });
    return [...g.entries()].sort((a, b) => (gradeMap.get(a[0])?.sort_order ?? 0) - (gradeMap.get(b[0])?.sort_order ?? 0));
  }, [mine, secMap, gradeMap]);

  // الفجوات: شعبة × مادة بلا معلمة
  const gaps = useMemo(() => {
    const taken = new Set(p.assignments.map((a) => `${a.section_id}:${a.grade_subject_id}`));
    const out: { grade: string; section: Section; subject: string }[] = [];
    p.sections.forEach((s) => p.gradeSubjects.filter((g) => g.grade_id === s.grade_id).forEach((g) => {
      if (!taken.has(`${s.id}:${g.id}`)) out.push({ grade: gradeMap.get(s.grade_id)?.name ?? '', section: s, subject: g.name });
    }));
    return out;
  }, [p.assignments, p.sections, p.gradeSubjects, gradeMap]);

  const others = (sectionId: string, gsId: string) =>
    p.assignments.filter((a) => a.section_id === sectionId && a.grade_subject_id === gsId && a.teacher_id !== sel).map((a) => tMap.get(a.teacher_id)?.full_name);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {p.isAdmin && (
          <Select value={p.branchId} onChange={(e) => { startNavProgress(); router.push(`/assignments?branch=${e.target.value}`); }} className="sm:w-56">
            {p.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <div className="inline-flex rounded-full bg-white p-1 shadow-soft">
          <button onClick={() => setView('teachers')} className={cn('rounded-full px-4 py-2 text-[13.5px]', view === 'teachers' ? 'bg-black text-white' : 'text-ink-soft')}>حسب المعلمة</button>
          <button onClick={() => setView('gaps')} className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px]', view === 'gaps' ? 'bg-black text-white' : 'text-ink-soft')}>
            مواد بلا معلمة {gaps.length > 0 && <span className={cn('num rounded-full px-1.5 text-[11px]', view === 'gaps' ? 'bg-white/20' : 'bg-rose text-white')}>{gaps.length}</span>}
          </button>
        </div>
      </div>

      {view === 'gaps' ? (
        <div className="card overflow-hidden">
          {gaps.length === 0 ? <EmptyState icon={<Link2 className="h-6 w-6" />} title="كل المواد مسندة" hint="كل شعبة في هذا الفرع لها معلمة لكل مادة." /> : (
            <ul className="divide-y divide-line">
              {gaps.map((g, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3 text-[14px]">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber" />
                  <span className="flex-1">{g.subject}</span>
                  <span className="text-[13px] text-ink-muted">{g.grade} · شعبة {g.section.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : p.teachers.length === 0 ? (
        <div className="card"><EmptyState icon={<Users className="h-6 w-6" />} title="لا توجد معلمات في هذا الفرع" hint="أضيفي حسابات المعلمات أولاً من صفحة الحسابات." /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="card overflow-hidden">
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث" className="pr-10" />
              </div>
            </div>
            <ul className="scrollbar-thin max-h-[32vh] overflow-y-auto p-2 lg:max-h-[64vh]">
              {teachers.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setSel(t.id)} className={cn('flex w-full items-center gap-3 rounded-2xl p-2.5 text-right transition', sel === t.id ? 'bg-surface' : 'hover:bg-surface/60')}>
                    <Avatar name={t.full_name} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{t.full_name}</span>
                    <span className={cn('num rounded-full px-2 py-0.5 text-[11.5px]', countBy[t.id] ? 'bg-peri-soft text-peri-deep' : 'bg-rose-soft text-rose')}>{countBy[t.id] ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            {teacher && (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Avatar name={teacher.full_name} className="h-11 w-11" />
                  <div className="flex-1">
                    <p className="text-[16px] font-semibold">{teacher.full_name}</p>
                    <p className="text-[12.5px] text-ink-muted" dir="ltr" style={{ textAlign: 'right' }}>{teacher.username}</p>
                  </div>
                  {mine.length > 0 && <Button variant="secondary" size="sm" onClick={() => setTransferTo('')}><ArrowLeftRight className="h-4 w-4" />نقل لمعلمة أخرى</Button>}
                  <Button size="sm" onClick={() => { setAdding(true); setGradeId(p.grades[0]?.id ?? ''); setSecs([]); setSubs([]); }}><Plus className="h-4 w-4" />إسناد جديد</Button>
                </div>
                {grouped.length === 0 ? (
                  <EmptyState title="لا توجد إسنادات" hint="أضيفي الصفوف والمواد التي ترصدها هذه المعلمة." />
                ) : (
                  <div className="space-y-4">
                    {grouped.map(([gid, bySub]) => (
                      <div key={gid}>
                        <p className="mb-2 text-[13px] font-medium text-ink-soft">{gradeMap.get(gid)?.name}</p>
                        <div className="space-y-2">
                          {[...bySub.entries()].map(([gsId, list]) => (
                            <div key={gsId} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3">
                              <span className="min-w-36 flex-1 text-[14px] font-medium">{gsMap.get(gsId)?.name}</span>
                              {list.map((a) => {
                                const dup = others(a.section_id, gsId);
                                return (
                                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-1 pr-3 text-[12.5px] ring-1 ring-line" title={dup.length ? `مسندة أيضاً لـ ${dup.join('، ')}` : undefined}>
                                    شعبة {secMap.get(a.section_id)?.name}
                                    {dup.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber" />}
                                    <button aria-label="إزالة" className="rounded-full p-1 text-ink-faint hover:bg-rose-soft hover:text-rose"
                                      onClick={() => exec(() => removeAssignment(a.id), {
                                        success: 'تمت إزالة الإسناد',
                                        confirm: { title: 'إزالة الإسناد', tone: 'danger', confirmText: 'إزالة',
                                          message: `${gsMap.get(gsId)?.name} — ${gradeMap.get(gid)?.name} شعبة ${secMap.get(a.section_id)?.name}. الدرجات المرصودة تبقى محفوظة.` },
                                      })}><X className="h-3.5 w-3.5" /></button>
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} size="lg" title="إسناد جديد" description={teacher?.full_name}
        footer={<>
          <Button loading={busy} disabled={!secs.length || !subs.length} onClick={async () => {
            const r = await exec(() => addAssignments(sel!, secs, subs), { success: (n) => (n ? `تم إضافة ${n} إسناد` : 'الإسنادات موجودة مسبقاً') });
            if (r?.ok) setAdding(false);
          }}>إسناد {subs.length} مادة × {secs.length} شعبة</Button>
          <Button variant="secondary" onClick={() => setAdding(false)}>إلغاء</Button>
        </>}>
        <div className="space-y-5">
          <Field label="الصف">
            <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSecs([]); setSubs([]); }}>
              {p.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <div>
            <p className="label">الشعب</p>
            {p.sections.filter((s) => s.grade_id === gradeId).length === 0
              ? <p className="text-[13px] text-rose">لا توجد شعب لهذا الصف — أضيفيها من الإعدادات</p>
              : <ChipPicker items={p.sections.filter((s) => s.grade_id === gradeId).map((s) => ({ id: s.id, label: `شعبة ${s.name}` }))} value={secs} onChange={setSecs} />}
          </div>
          <div>
            <p className="label">المواد</p>
            {p.gradeSubjects.filter((g) => g.grade_id === gradeId).length === 0
              ? <p className="text-[13px] text-rose">لا توجد مواد مربوطة بهذا الصف</p>
              : <ChipPicker items={p.gradeSubjects.filter((g) => g.grade_id === gradeId).map((g) => ({ id: g.id, label: g.name }))} value={subs} onChange={setSubs} />}
          </div>
          {secs.length > 0 && subs.length > 0 && (() => {
            const taken = secs.flatMap((s) => subs.map((g) => others(s, g).length ? `${gsMap.get(g)?.name} (شعبة ${secMap.get(s)?.name})` : null)).filter(Boolean);
            return taken.length ? <p className="rounded-xl bg-amber-soft p-3 text-[13px] leading-6 text-amber">مسندة مسبقاً لمعلمة أخرى: {taken.join('، ')}</p> : null;
          })()}
        </div>
      </Dialog>

      <Dialog open={transferTo !== null} onClose={() => setTransferTo(null)} title="نقل الإسنادات"
        description={`نقل كل إسنادات ${teacher?.full_name ?? ''} (${mine.length}) إلى معلمة أخرى`}
        footer={<>
          <Button loading={busy} disabled={!transferTo} onClick={async () => {
            const r = await exec(() => transferAssignments(sel!, transferTo!), {
              success: (n) => `تم نقل ${n} إسناد`,
              confirm: { title: 'تأكيد النقل', message: `ستُزال الإسنادات من ${teacher?.full_name} وتُضاف إلى ${tMap.get(transferTo!)?.full_name}.`, confirmText: 'نقل' },
            });
            if (r?.ok) { setTransferTo(null); setSel(transferTo); }
          }}>نقل</Button>
          <Button variant="secondary" onClick={() => setTransferTo(null)}>إلغاء</Button>
        </>}>
        <Select value={transferTo ?? ''} onChange={(e) => setTransferTo(e.target.value)}>
          <option value="">اختاري المعلمة</option>
          {p.teachers.filter((t) => t.id !== sel).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </Select>
        {transferTo && <Badge tone="info" className="mt-3">لديها حالياً {countBy[transferTo] ?? 0} إسناد</Badge>}
      </Dialog>
    </>
  );
}
