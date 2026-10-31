import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { ReviewsClient, type ReviewRow } from './reviews-client';
import type { Branch, Section } from '@/lib/types';

export const metadata = { title: 'مراجعة الطلاب' };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; branch?: string }> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const sp = await searchParams;
  const status = sp.status === 'resolved' ? 'resolved' : 'pending';
  const kind = ['added', 'released', 'excluded'].includes(sp.kind ?? '') ? sp.kind! : '';
  const branch = profile.role === 'admin' ? sp.branch ?? '' : '';

  let q = supabase.from('student_reviews').select(`
      id, kind, reason, created_at, status, resolution, resolved_at, note, branch_id, section_id, grade_subject_id,
      student:students(id, full_name, student_number, national_id, name_en, birth_date, nationality, id_type, gender,
        branch_id, grade_id, section_id, needs_review, is_active, grade:grades(name), current:sections(name)),
      section:sections(name),
      grade_subject:grade_subjects(subject:subjects(name)),
      creator:profiles!student_reviews_created_by_fkey(full_name),
      resolver:profiles!student_reviews_resolved_by_fkey(full_name),
      branch:branches(name)
    `).eq('status', status).order(status === 'pending' ? 'created_at' : 'resolved_at', { ascending: status === 'pending' }).limit(300);
  if (kind) q = q.eq('kind', kind);
  if (branch) q = q.eq('branch_id', branch);

  // عدد المعلّق لكل نوع (للتبويبات)
  const countOf = (k: string) => {
    let c = supabase.from('student_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', k);
    if (branch) c = c.eq('branch_id', branch);
    return c;
  };
  const [rows, branches, cAdded, cReleased, cExcluded] = await Promise.all([
    q,
    supabase.from('branches').select('id, name, code, is_active').order('name'),
    countOf('added'), countOf('released'), countOf('excluded'),
  ]);
  if (rows.error) {
    // الجدول غير موجود = لم يُشغَّل ملف 0007 بعد — رسالة واضحة بدل صفحة خطأ
    if (/PGRST205|student_reviews/i.test(`${rows.error.code} ${rows.error.message}`)) {
      return (
        <div>
          <PageHeader title="مراجعة الطلاب" />
          <div className="card p-6 text-[14px] leading-7">
            <p className="font-semibold text-rose">هذه الصفحة تحتاج تحديث قاعدة البيانات أولاً</p>
            <p className="mt-1 text-ink-soft">في Supabase ← SQL Editor، شغّلي الملف <code dir="ltr" className="rounded bg-surface px-1.5 font-mono text-[13px]">supabase/migrations/0007_student_reviews.sql</code> من المستودع، ثم أعيدي فتح الصفحة.</p>
          </div>
        </div>
      );
    }
    throw rows.error;
  }
  const list = (rows.data ?? []) as unknown as ReviewRow[];

  // الشعب المتاحة لنقل الطلاب المُرجَعين (نفس الفرع والصف)
  const pairs = [...new Set(list.filter((r) => r.kind === 'released' && r.student).map((r) => `${r.student!.branch_id}:${r.student!.grade_id}`))];
  let sections: Section[] = [];
  if (pairs.length) {
    const branchIds = [...new Set(pairs.map((p) => p.split(':')[0]))];
    const { data } = await supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active').in('branch_id', branchIds).order('sort_order');
    sections = ((data ?? []) as Section[]).filter((s) => pairs.includes(`${s.branch_id}:${s.grade_id}`));
  }

  return (
    <div>
      <PageHeader title="مراجعة الطلاب" subtitle="ما فعلته المعلمات بالطلاب: إضافة، إرجاع لقائمة الصف، أو استبعاد من مادة — راجعيه وقرّري" />
      <ReviewsClient
        isAdmin={profile.role === 'admin'}
        rows={list} sections={sections}
        branches={(branches.data ?? []) as Branch[]}
        filters={{ kind, status, branch }}
        counts={{ added: cAdded.count ?? 0, released: cReleased.count ?? 0, excluded: cExcluded.count ?? 0 }}
      />
    </div>
  );
}
