import Link from 'next/link';
import { History, Lock, Clock, PencilLine, CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { getTeacherSheets, isEditable, editDeadline } from '@/lib/teacher';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { fmtDateTime, timeLeft } from '@/lib/utils';
import { UnlockButton } from './unlock-button';

export const metadata = { title: 'سجلات الرصد' };

export default async function RecordsPage() {
  const { supabase, profile } = await requireRole('teacher');
  const settings = await getSettings();
  const [sheets, { data: pending }] = await Promise.all([
    getTeacherSheets(supabase, profile.id, settings.current_term, settings.academic_year),
    supabase.from('requests').select('section_id, grade_subject_id').eq('requested_by', profile.id).eq('status', 'pending').eq('type', 'unlock_sheet'),
  ]);
  const pend = new Set((pending ?? []).map((p) => `${p.section_id}:${p.grade_subject_id}`));
  const done = sheets.filter((s) => s.components.some((c) => c.submission));

  return (
    <div>
      <PageHeader title="سجلات الرصد" subtitle={`الكشوفات المحفوظة في الترم ${settings.current_term === 1 ? 'الأول' : 'الثاني'} — التعديل متاح ${settings.edit_window_days} أيام من الحفظ`} />
      {done.length === 0 ? (
        <div className="card"><EmptyState icon={<History className="h-6 w-6" />} title="لم تحفظي أي كشف بعد" hint="الكشوفات التي تحفظينها تظهر هنا مع مدة التعديل المتبقية."
          action={<Link href="/grading" className="rounded-full bg-black px-5 py-2.5 text-[14px] text-white">ابدئي الرصد</Link>} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {done.map((s) => {
            const subs = s.components.filter((c) => c.submission);
            const anyEditable = s.components.some((c) => c.submission && isEditable(c.submission));
            const allLocked = subs.every((c) => !isEditable(c.submission));
            const complete = subs.length === s.components.length;
            const last = subs.map((c) => c.submission!.last_edited_at ?? c.submission!.submitted_at).sort().at(-1);
            const key = `${s.section_id}:${s.grade_subject_id}`;
            return (
              <div key={key} className="card p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15.5px] font-semibold">{s.subject_name}</p>
                    <p className="text-[12.5px] text-ink-muted">{s.grade_name} · شعبة {s.section_name}</p>
                  </div>
                  {complete ? <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>مكتمل</Badge> : <Badge tone="warning">{subs.length} من {s.components.length}</Badge>}
                </div>
                <ul className="space-y-1.5">
                  {s.components.map((c) => {
                    const sb = c.submission;
                    const left = sb && isEditable(sb) ? timeLeft(editDeadline(sb)) : null;
                    return (
                      <li key={c.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-[13px]">
                        <span>{c.name}</span>
                        {!sb ? <span className="text-ink-faint">لم يُرصد</span>
                          : left ? <span className="inline-flex items-center gap-1 text-peri-deep"><Clock className="h-3.5 w-3.5" />متاح {left}</span>
                          : <span className="inline-flex items-center gap-1 text-ink-muted"><Lock className="h-3.5 w-3.5" />مقفل</span>}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <span className="flex-1 text-[12px] text-ink-muted">آخر حفظ: {fmtDateTime(last)}</span>
                  {allLocked && (pend.has(key) ? <Badge tone="warning">طلب الفتح قيد المراجعة</Badge> : <UnlockButton sectionId={s.section_id} gradeSubjectId={s.grade_subject_id} label={`${s.subject_name} · ${s.grade_name} ${s.section_name}`} />)}
                  <Link href={`/grading?section=${s.section_id}&subject=${s.grade_subject_id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black px-4 text-[13px] text-white">
                    <PencilLine className="h-4 w-4" />{anyEditable || !complete ? 'فتح وتعديل' : 'عرض'}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
