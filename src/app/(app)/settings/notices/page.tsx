import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { getSettings } from '@/lib/data';
import { normalizeBranch, normalizeNotice } from '@/lib/notice';
import { NoticeSettingsClient, type SectionRow, type TeacherRow } from './notice-settings-client';

export const metadata = { title: 'إعدادات الإشعارات' };

export default async function NoticeSettingsPage() {
  const { supabase } = await requireRole('admin');
  const settings = await getSettings();
  const [g, br, branches, subjects, grades, sections, teachers, ct, vl] = await Promise.all([
    supabase.from('notice_settings').select('data').eq('id', 1).maybeSingle(),
    supabase.from('notice_branch_settings').select('branch_id, data'),
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    supabase.from('subjects').select('id, name, name_en').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('grades').select('id, name, name_en, sort_order, assessment_mode').eq('is_active', true).order('sort_order'),
    supabase.from('sections').select('id, name, branch_id, grade_id, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('id, full_name, branch_id').eq('role', 'teacher').eq('is_active', true).order('full_name'),
    supabase.from('class_teachers').select('section_id, teacher_id'),
    supabase.from('verbal_levels').select('label'),
  ]);
  const levels = [...new Set((vl.data ?? []).map((r) => r.label as string))];
  const missing = !!(g.error || br.error || ct.error || subjects.error);
  const homeroom = new Map((ct.data ?? []).map((r) => [r.section_id as string, r.teacher_id as string]));
  const gradeName = new Map((grades.data ?? []).map((x) => [x.id as string, x.name as string]));
  const gradeSort = new Map((grades.data ?? []).map((x) => [x.id as string, x.sort_order as number]));
  const secRows: SectionRow[] = (sections.data ?? []).map((s) => ({
    id: s.id, name: s.name, branch_id: s.branch_id, grade: gradeName.get(s.grade_id) ?? '—',
    sort: (gradeSort.get(s.grade_id) ?? 0) * 1000 + (s.sort_order ?? 0), teacher_id: homeroom.get(s.id) ?? null,
  }));
  const branchData: Record<string, ReturnType<typeof normalizeBranch>> = {};
  (br.data ?? []).forEach((r) => { branchData[r.branch_id as string] = normalizeBranch(r.data); });

  return (
    <div>
      <PageHeader title="إعدادات الإشعارات" subtitle="ترويسة إشعار الدرجات والشعارات والمديرات ومربيات الفصول، قبل إصداره" />
      <NoticeSettingsClient
        missing={missing}
        initial={normalizeNotice(g.data?.data)}
        school={settings.school_name}
        year={settings.academic_year}
        branches={(branches.data ?? []) as { id: string; name: string }[]}
        branchData={branchData}
        subjects={(subjects.data ?? []) as { id: string; name: string; name_en: string | null }[]}
        grades={(grades.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string, name_en: (x.name_en as string | null) ?? null, verbal: x.assessment_mode === 'verbal' }))}
        sections={secRows}
        teachers={(teachers.data ?? []) as TeacherRow[]}
        levels={levels}
      />
    </div>
  );
}
