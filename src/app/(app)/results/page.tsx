import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { ResultsClient, type SubjectStatus } from './results-client';
import type { Branch, Grade, Section } from '@/lib/types';

export const metadata = { title: 'نتائج الرصد' };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ branch?: string; grade?: string; section?: string; term?: string }> }) {
  const { supabase, profile } = await requireRole('admin', 'supervisor');
  const settings = await getSettings();
  const sp = await searchParams;
  const { data: branches } = await supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name');
  const branchId = profile.role === 'supervisor' ? profile.branch_id! : (sp.branch ?? branches?.[0]?.id ?? '');
  const term = (sp.term === '2' ? 2 : sp.term === '1' ? 1 : settings.current_term) as 1 | 2;

  const [{ data: grades }, { data: sections }] = await Promise.all([
    supabase.from('grades').select('id, stage_id, name, sort_order, assessment_mode, is_active, branch_grades!inner(branch_id)').eq('branch_grades.branch_id', branchId).order('sort_order'),
    supabase.from('sections').select('id, branch_id, grade_id, name, sort_order, is_active').eq('branch_id', branchId).order('sort_order'),
  ]);
  const gradeId = sp.grade ?? grades?.[0]?.id ?? '';
  const secList = (sections ?? []).filter((s) => s.grade_id === gradeId);
  const sectionId = sp.section && secList.some((s) => s.id === sp.section) ? sp.section : secList[0]?.id ?? '';

  let status: SubjectStatus[] = [];
  let studentCount = 0;
  if (sectionId) {
    const [{ data: gs }, { data: excl }, { data: subs }, { data: assigns }, { count }] = await Promise.all([
      supabase.from('grade_subjects').select('id, subject:subjects(name), comps:assessment_components(id, name, sort_order)').eq('grade_id', gradeId).order('sort_order'),
      supabase.from('branch_subject_exclusions').select('grade_subject_id').eq('branch_id', branchId),
      supabase.from('submissions').select('component_id, submitted_at, last_edited_at, edit_until, unlocked_until, submitter:profiles(full_name)').eq('section_id', sectionId).eq('term', term).eq('academic_year', settings.academic_year),
      supabase.from('teacher_assignments').select('grade_subject_id, teacher:profiles(full_name)').eq('section_id', sectionId),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('section_id', sectionId).eq('is_active', true),
    ]);
    studentCount = count ?? 0;
    const ex = new Set((excl ?? []).map((e) => e.grade_subject_id));
    const subMap = new Map(((subs ?? []) as unknown as { component_id: string; submitted_at: string; last_edited_at: string | null; submitter: { full_name: string } | null }[]).map((s) => [s.component_id, s]));
    const tMap = new Map<string, string[]>();
    ((assigns ?? []) as unknown as { grade_subject_id: string; teacher: { full_name: string } | null }[]).forEach((a) => {
      if (!tMap.has(a.grade_subject_id)) tMap.set(a.grade_subject_id, []);
      if (a.teacher) tMap.get(a.grade_subject_id)!.push(a.teacher.full_name);
    });
    status = ((gs ?? []) as unknown as { id: string; subject: { name: string } | null; comps: { id: string; name: string; sort_order: number }[] }[])
      .filter((g) => !ex.has(g.id))
      .map((g) => ({
        id: g.id, name: g.subject?.name ?? '—', teachers: tMap.get(g.id) ?? [],
        comps: [...g.comps].sort((a, b) => a.sort_order - b.sort_order).map((c) => {
          const s = subMap.get(c.id);
          return { id: c.id, name: c.name, at: s ? (s.last_edited_at ?? s.submitted_at) : null, by: s?.submitter?.full_name ?? null };
        }),
      }));
  }

  return (
    <div>
      <PageHeader title="نتائج الرصد" subtitle="تصفح كشوفات أي شعبة وصدّريها إكسل" />
      <ResultsClient
        role={profile.role as 'admin' | 'supervisor'}
        branches={(branches ?? []) as Branch[]}
        grades={(grades ?? []) as unknown as Grade[]}
        sections={(sections ?? []) as Section[]}
        filters={{ branch: branchId, grade: gradeId, section: sectionId, term }}
        status={status}
        studentCount={studentCount}
      />
    </div>
  );
}
