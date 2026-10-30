'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus, Undo2, UserMinus, CheckCircle2, Pencil, ArrowRightLeft, UserX, RotateCcw, Check, Inbox, Loader2, CheckCheck,
} from 'lucide-react';
import { resolveReview, approveAllAdded } from '@/app/actions/reviews';
import { saveStudent } from '@/app/actions/students';
import { startNavProgress } from '@/components/shell/nav-progress';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty';
import { cn, fmtDateTime, secLabel } from '@/lib/utils';
import type { Branch, Section } from '@/lib/types';

type Kind = 'added' | 'released' | 'excluded';
export interface ReviewRow {
  id: string; kind: Kind; reason: string | null; created_at: string; status: 'pending' | 'resolved';
  resolution: string | null; resolved_at: string | null; note: string | null; branch_id: string;
  section_id: string | null; grade_subject_id: string | null;
  student: {
    id: string; full_name: string; student_number: string | null; national_id: string | null; name_en: string | null;
    birth_date: string | null; nationality: string | null; id_type: string | null; gender: 'male' | 'female' | null;
    branch_id: string; grade_id: string; section_id: string | null; needs_review: boolean; is_active: boolean;
    grade: { name: string } | null; current: { name: string } | null;
  } | null;
  section: { name: string } | null;
  grade_subject: { subject: { name: string } | null } | null;
  creator: { full_name: string } | null;
  resolver: { full_name: string } | null;
  branch: { name: string } | null;
}

const KIND: Record<Kind, { label: string; icon: typeof UserPlus; tone: string; explain: string }> = {
  added:    { label: 'أضافته المعلمة',        icon: UserPlus,  tone: 'bg-peri-soft text-peri-deep', explain: 'طالب لم يكن في النظام وأضافته المعلمة للكشف — راجعي بياناته وأكمليها ثم اعتمديه.' },
  released: { label: 'أُرجع لقائمة الصف',     icon: Undo2,     tone: 'bg-amber-soft text-amber',    explain: 'قالت المعلمة إنه ليس من شعبتها — انقليه لشعبته الصحيحة، أو أوقفيه إذا ترك المدرسة.' },
  excluded: { label: 'استُبعد من مادة',        icon: UserMinus, tone: 'bg-rose-soft text-rose',      explain: 'لن يُرصد في هذه المادة — وافقي على السبب، أو أعيديه للكشف، أو أوقفيه إذا كان منقطعاً.' },
};
const RESOLUTION: Record<string, string> = {
  approved: 'تم الاعتماد', moved: 'نُقل لشعبة', claimed: 'ضمّته معلمة لشعبتها', kept: 'أُبقي بدون شعبة',
  restored: 'أُعيد للكشف', deactivated: 'أُوقف الطالب',
};
const MISSING: [keyof NonNullable<ReviewRow['student']>, string][] = [
  ['student_number', 'الرقم الأكاديمي'], ['national_id', 'رقم الهوية'], ['gender', 'الجنس'], ['birth_date', 'تاريخ الميلاد'], ['nationality', 'الجنسية'],
];

export function ReviewsClient({ isAdmin, rows, sections, branches, filters, counts }: {
  isAdmin: boolean; rows: ReviewRow[]; sections: Section[]; branches: Branch[];
  filters: { kind: string; status: string; branch: string }; counts: Record<Kind, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<NonNullable<ReviewRow['student']> & { reviewId: string } | null>(null);
  const [moveFor, setMoveFor] = useState<ReviewRow | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const { exec, busy } = useAction();
  const total = counts.added + counts.released + counts.excluded;
  const pendingView = filters.status === 'pending';

  const nav = (patch: Partial<typeof filters>) => {
    const f = { ...filters, ...patch };
    startNavProgress();
    start(() => router.push(`/reviews?${new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'status' && v === 'pending')))}`));
  };

  const act = (r: ReviewRow, action: 'approve' | 'keep' | 'restore' | 'deactivate') => {
    const name = r.student?.full_name ?? 'الطالب';
    const subject = r.grade_subject?.subject?.name;
    const conf = {
      approve: r.kind === 'added'
        ? { title: 'اعتماد الطالب', message: <>اعتماد بيانات <b>{name}</b> كطالب في {r.student?.grade?.name} {secLabel(r.student?.current?.name)}.</>, confirmText: 'اعتماد', tone: 'success' as const }
        : { title: 'الموافقة على الاستبعاد', message: <><b>{name}</b> يبقى مستبعداً من كشف {subject} — السبب: {r.reason ?? '—'}.</>, confirmText: 'موافقة' },
      keep: { title: 'إبقاؤه بدون شعبة', message: <><b>{name}</b> يبقى في قائمة طلاب الصف لتختاره معلمة شعبته.</>, confirmText: 'موافقة' },
      restore: { title: 'إعادته للكشف', message: <><b>{name}</b> يعود لكشف {subject} ويجب على المعلمة رصده.</>, confirmText: 'إعادة' },
      deactivate: { title: 'إيقاف الطالب', message: <><b>{name}</b> سيُوقف في النظام كله ولن يظهر في أي كشف (مثلاً انتقل من المدرسة أو انقطع). درجاته السابقة تبقى محفوظة.</>, confirmText: 'إيقاف', tone: 'danger' as const },
    }[action];
    void exec(() => resolveReview(r.id, action), {
      confirm: conf,
      success: { approve: r.kind === 'added' ? 'تم اعتماد الطالب' : 'تمت الموافقة', keep: 'تم', restore: 'أُعيد الطالب للكشف', deactivate: 'تم إيقاف الطالب' }[action],
    });
  };

  const addedRows = rows.filter((r) => r.kind === 'added' && r.status === 'pending');

  return (
    <div className={cn('transition-opacity', pending && 'opacity-70')}>
      {/* التبويبات */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Tab active={!filters.kind} onClick={() => nav({ kind: '' })} count={pendingView ? total : undefined}>الكل</Tab>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <Tab key={k} active={filters.kind === k} onClick={() => nav({ kind: k })} count={pendingView ? counts[k] : undefined}>{KIND[k].label}</Tab>
          ))}
        </div>
        <div className="flex gap-2 lg:mr-auto">
          <Select value={filters.status} onChange={(e) => nav({ status: e.target.value })} className="h-10 w-40 text-[13.5px]">
            <option value="pending">بانتظار القرار</option>
            <option value="resolved">تمت مراجعتها</option>
          </Select>
          {isAdmin && (
            <Select value={filters.branch} onChange={(e) => nav({ branch: e.target.value })} className="h-10 w-40 text-[13.5px]">
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          {pending && <Loader2 className="h-5 w-5 animate-spin self-center text-ink-muted" />}
        </div>
      </div>

      {filters.kind && pendingView && <p className="mb-4 rounded-card bg-white px-4 py-3 text-[13px] leading-6 text-ink-soft shadow-soft">{KIND[filters.kind as Kind].explain}</p>}

      {pendingView && addedRows.length > 1 && (filters.kind === 'added' || !filters.kind) && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" loading={busy} onClick={() => exec(() => approveAllAdded(addedRows.map((r) => r.id)), {
            confirm: { title: 'اعتماد كل الطلاب المضافين', message: `اعتماد ${addedRows.length} طالب أضافتهم المعلمات كما هم. يمكنك تعديل بيانات أي طالب لاحقاً من صفحة الطلاب.`, confirmText: 'اعتماد الكل', tone: 'success' },
            success: (n) => `تم اعتماد ${n} طالب`,
          })}><CheckCheck className="h-4 w-4" />اعتماد كل المضافين ({addedRows.length})</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={pendingView ? <CheckCircle2 className="h-6 w-6 text-mint" /> : <Inbox className="h-6 w-6" />}
            title={pendingView ? 'لا يوجد طلاب بانتظار المراجعة' : 'لا توجد مراجعات سابقة'}
            hint={pendingView ? 'عندما تضيف معلمة طالباً أو تستبعده أو تُرجعه لقائمة الصف، يظهر هنا.' : undefined} />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((r) => {
            const K = KIND[r.kind]; const st = r.student;
            const missing = r.kind === 'added' && st ? MISSING.filter(([f]) => !st[f]).map(([, l]) => l) : [];
            return (
              <article key={r.id} className={cn('card flex flex-col p-4 sm:p-5', st && !st.is_active && r.status === 'pending' && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', K.tone)}><K.icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-6">{st?.full_name ?? 'طالب محذوف'}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {st?.grade?.name} {r.kind === 'released' ? `· كان في ${secLabel(r.section?.name)}` : st?.current ? `· ${secLabel(st.current.name)}` : '· بدون شعبة'}
                      {isAdmin && r.branch ? ` · ${r.branch.name}` : ''}
                      {st?.student_number && <> · <span dir="ltr" className="num">{st.student_number}</span></>}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium', K.tone)}>{K.label}</span>
                </div>

                <div className="mt-3 space-y-1.5 rounded-2xl bg-surface p-3 text-[13px] leading-6">
                  <p><span className="text-ink-muted">بواسطة:</span> {r.creator?.full_name ?? '—'} · <span className="text-ink-muted">{fmtDateTime(r.created_at)}</span></p>
                  {r.kind === 'excluded' && <p><span className="text-ink-muted">المادة:</span> {r.grade_subject?.subject?.name ?? '—'}</p>}
                  {r.reason && r.kind !== 'added' && <p><span className="text-ink-muted">السبب:</span> {r.reason}</p>}
                  {missing.length > 0 && (
                    <p className="text-amber"><span className="text-ink-muted">بيانات ناقصة:</span> {missing.join('، ')}</p>
                  )}
                  {r.status === 'resolved' && (
                    <p className="text-mint">
                      <Check className="-mt-0.5 ml-1 inline h-4 w-4" />{RESOLUTION[r.resolution ?? ''] ?? r.resolution}
                      {r.resolution === 'moved' && st?.current ? ` (${secLabel(st.current.name)})` : ''} — {r.resolver?.full_name ?? '—'} · {fmtDateTime(r.resolved_at)}
                      {r.note && <span className="block text-ink-soft">ملاحظة: {r.note}</span>}
                    </p>
                  )}
                </div>

                {r.status === 'pending' && st && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.kind === 'added' && <>
                      <Button size="sm" onClick={() => setEdit({ ...st, reviewId: r.id })}><Pencil className="h-4 w-4" />إكمال البيانات واعتماد</Button>
                      <Button size="sm" variant="secondary" onClick={() => act(r, 'approve')}><Check className="h-4 w-4" />اعتماد كما هو</Button>
                    </>}
                    {r.kind === 'released' && <>
                      <Button size="sm" onClick={() => { setMoveFor(r); setMoveTo(''); }}><ArrowRightLeft className="h-4 w-4" />نقل لشعبته</Button>
                      <Button size="sm" variant="secondary" onClick={() => act(r, 'keep')}>إبقاؤه بدون شعبة</Button>
                    </>}
                    {r.kind === 'excluded' && <>
                      <Button size="sm" onClick={() => act(r, 'approve')}><Check className="h-4 w-4" />موافقة</Button>
                      <Button size="sm" variant="secondary" onClick={() => act(r, 'restore')}><RotateCcw className="h-4 w-4" />إعادته للكشف</Button>
                    </>}
                    <Button size="sm" variant="ghost" className="mr-auto text-rose" onClick={() => act(r, 'deactivate')}><UserX className="h-4 w-4" />إيقاف الطالب</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* إكمال بيانات الطالب المضاف */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="إكمال بيانات الطالب" description="أكملي ما ينقص ثم احفظي — يُعتمد الطالب تلقائياً"
        footer={<>
          <Button loading={busy} onClick={async () => {
            if (!edit) return;
            const r = await exec(() => saveStudent({
              id: edit.id, full_name: edit.full_name, student_number: edit.student_number ?? '', national_id: edit.national_id ?? '',
              name_en: edit.name_en ?? '', birth_date: edit.birth_date ?? '', nationality: edit.nationality ?? '', id_type: edit.id_type ?? '',
              gender: edit.gender, branch_id: edit.branch_id, grade_id: edit.grade_id, section_id: edit.section_id,
            }), { refresh: false });
            if (!r?.ok) return;
            const a = await exec(() => resolveReview(edit.reviewId, 'approve'), { success: 'تم حفظ البيانات واعتماد الطالب' });
            if (a?.ok) setEdit(null);
          }}><Check className="h-4 w-4" />حفظ واعتماد</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        {edit && (
          <div className="space-y-4">
            <Field label="الرقم الأكاديمي" hint="المعرّف الأساسي للطالب — لا يتكرر">
              <Input value={edit.student_number ?? ''} onChange={(e) => setEdit({ ...edit, student_number: e.target.value })} dir="ltr" className="text-right" inputMode="numeric" />
            </Field>
            <Field label="اسم الطالب الرباعي (عربي)"><Input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label="اسم الطالب (إنجليزي)"><Input value={edit.name_en ?? ''} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} dir="ltr" className="text-right" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الجنس">
                <Select value={edit.gender ?? ''} onChange={(e) => setEdit({ ...edit, gender: (e.target.value || null) as 'male' | 'female' | null })}>
                  <option value="">غير محدد</option><option value="male">طالب</option><option value="female">طالبة</option>
                </Select>
              </Field>
              <Field label="تاريخ الميلاد"><Input value={edit.birth_date ?? ''} onChange={(e) => setEdit({ ...edit, birth_date: e.target.value })} placeholder="هجري أو ميلادي" /></Field>
              <Field label="الجنسية"><Input value={edit.nationality ?? ''} onChange={(e) => setEdit({ ...edit, nationality: e.target.value })} /></Field>
              <Field label="نوع الهوية">
                <Select value={edit.id_type ?? ''} onChange={(e) => setEdit({ ...edit, id_type: e.target.value })}>
                  <option value="">غير محدد</option>
                  {['هوية وطنية', 'إقامة', 'جواز سفر', 'هوية زائر', 'بدون'].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="رقم الهوية" className="col-span-2"><Input value={edit.national_id ?? ''} onChange={(e) => setEdit({ ...edit, national_id: e.target.value })} dir="ltr" className="text-right" /></Field>
            </div>
          </div>
        )}
      </Dialog>

      {/* نقل الطالب المُرجَع لشعبته */}
      <Dialog open={!!moveFor} onClose={() => setMoveFor(null)} title="نقل الطالب لشعبته"
        description={moveFor && <>{moveFor.student?.full_name} — {moveFor.student?.grade?.name}. كان في {secLabel(moveFor.section?.name)}.</>}
        footer={<>
          <Button loading={busy} disabled={!moveTo} onClick={async () => {
            const r = await exec(() => resolveReview(moveFor!.id, 'move', moveTo), { success: 'تم نقل الطالب لشعبته' });
            if (r?.ok) setMoveFor(null);
          }}><ArrowRightLeft className="h-4 w-4" />نقل</Button>
          <Button variant="secondary" onClick={() => setMoveFor(null)}>إلغاء</Button>
        </>}>
        {moveFor?.student && (() => {
          const opts = sections.filter((s) => s.branch_id === moveFor.student!.branch_id && s.grade_id === moveFor.student!.grade_id && s.id !== moveFor.section_id);
          return opts.length ? (
            <div className="flex flex-wrap gap-2 pb-2">
              {opts.map((s) => (
                <button key={s.id} onClick={() => setMoveTo(s.id)}
                  className={cn('rounded-full border px-4 py-2.5 text-[14px] transition', moveTo === s.id ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>
                  {secLabel(s.name)}
                </button>
              ))}
            </div>
          ) : <p className="pb-2 text-[13.5px] text-amber">لا توجد شعبة أخرى لهذا الصف. إذا كان الطالب في نفس الشعبة فعلاً، أعيديه بـ«إبقاؤه بدون شعبة» ثم تضمه المعلمة، أو أضيفي شعبة جديدة من الإعدادات.</p>;
        })()}
      </Dialog>
    </div>
  );
}

function Tab({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] transition', active ? 'bg-black text-white' : 'bg-white text-ink-soft shadow-soft hover:text-ink')}>
      {children}
      {count !== undefined && count > 0 && <span className={cn('num rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white/20' : 'bg-rose text-white')}>{count}</span>}
    </button>
  );
}

