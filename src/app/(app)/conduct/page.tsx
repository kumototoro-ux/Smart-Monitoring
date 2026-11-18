import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { getTeacherSheets } from '@/lib/teacher';
import { PageHeader } from '@/components/ui/page-header';
import { ConductClient } from './conduct-client';

export const metadata = { title: 'المواظبة والسلوك' };
export const dynamic = 'force-dynamic';

export default async function ConductPage() {
  const { supabase, profile } = await requireRole('teacher');
  const settings = await getSettings();
  const { data: flag, error } = await supabase.from('settings').select('conduct_enabled').eq('id', 1).single();
  const sheets = await getTeacherSheets(supabase, profile.id, settings.current_term, settings.academic_year);
  const sections = [...new Map(sheets.map((s) => [s.section_id, { id: s.section_id, name: s.section_name, grade: s.grade_name, order: s.grade_order, mode: s.mode }])).values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'));
  return (
    <div>
      <PageHeader title="المواظبة والسلوك" subtitle="تقييم منفصل لكل شعبة تدرّسينها، لا يدخل في مجموع الدرجات، ويُحسب متوسطه في الإشعار" />
      <ConductClient sections={sections} enabled={!error && !!flag?.conduct_enabled} migrated={!error} />
    </div>
  );
}
