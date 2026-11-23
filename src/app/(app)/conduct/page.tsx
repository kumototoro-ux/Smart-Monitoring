import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { getTeacherSheets } from '@/lib/teacher';
import { PageHeader } from '@/components/ui/page-header';
import { ConductClient } from './conduct-client';
import { ConductManage, type SectionStat } from './manage';

export const metadata = { title: 'المواظبة والسلوك' };
export const dynamic = 'force-dynamic';

export default async function ConductPage() {
  const { supabase, profile } = await requireRole('teacher', 'supervisor', 'admin');
  const settings = await getSettings();
  const { data: flag, error } = await supabase.from('settings').select('conduct_enabled').eq('id', 1).single();
  const gr = await supabase.from('grades').select('id, name, sort_order, conduct_applies');
  const off = new Set(gr.error ? [] : (gr.data ?? []).filter((g) => g.conduct_applies === false).map((g) => g.name as string));
  const enabled = !error && !!flag?.conduct_enabled;

  if (profile.role !== 'teacher') {
    // الأدمن: كل الفروع، المشرفة: فرعها (تحصرها سياسات القاعدة)
    const [sec, br] = await Promise.all([
      supabase.from('sections').select('id, name, branch_id, grade_id, sort_order').eq('is_active', true),
      supabase.from('branches').select('id, name'),
    ]);
    const gMap = new Map((gr.data ?? []).map((g) => [g.id as string, g]));
    const bMap = new Map((br.data ?? []).map((b) => [b.id as string, b.name as string]));
    const sections = (sec.data ?? [])
      .filter((s) => gMap.has(s.grade_id as string) && !off.has(gMap.get(s.grade_id as string)!.name as string))
      .map((s) => ({
        id: s.id as string, name: s.name as string, grade: gMap.get(s.grade_id as string)!.name as string,
        order: ((gMap.get(s.grade_id as string)!.sort_order as number) ?? 0) * 1000 + ((s.sort_order as number) ?? 0),
        branch: bMap.get(s.branch_id as string) ?? '', branch_id: s.branch_id as string,
      }))
      .sort((a, b) => a.branch.localeCompare(b.branch, 'ar') || a.order - b.order);
    // ملخص التقدم لكل شعبة (يعمل بعد 0029؛ قبلها تُعرض الشعب بلا أرقام)
    const ov = enabled ? await supabase.rpc('conduct_manage_overview') : null;
    const stats: Record<string, SectionStat> | null = ov && !ov.error && Array.isArray(ov.data)
      ? Object.fromEntries((ov.data as { section_id: string; students: number; done: number; manual: number; low: number }[]).map((r) => [r.section_id, r]))
      : null;
    return (
      <div>
        <PageHeader title="المواظبة والسلوك" subtitle={profile.role === 'admin' ? 'راجعي وعدّلي مواظبة وسلوك أي شعبة في أي فرع' : 'راجعي وعدّلي مواظبة وسلوك شعب فرعك'} />
        <ConductManage sections={sections} stats={stats} enabled={enabled} migrated={!error} />
      </div>
    );
  }

  const sheets = await getTeacherSheets(supabase, profile.id, settings.current_term, settings.academic_year);
  const sections = [...new Map(sheets.filter((s) => !off.has(s.grade_name)).map((s) => [s.section_id, { id: s.section_id, name: s.section_name, grade: s.grade_name, order: s.grade_order, mode: s.mode }])).values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'));
  return (
    <div>
      <PageHeader title="المواظبة والسلوك" subtitle="تقييم منفصل لكل شعبة تدرّسينها، لا يدخل في مجموع الدرجات، ويُحسب متوسطه في الإشعار" />
      <ConductClient sections={sections} enabled={enabled} migrated={!error} />
    </div>
  );
}
