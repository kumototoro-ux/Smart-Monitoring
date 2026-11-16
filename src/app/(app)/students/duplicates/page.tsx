import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { DuplicatesClient } from './duplicates-client';

export const metadata = { title: 'دمج الأسماء المكررة' };

export default async function DuplicatesPage() {
  const { supabase } = await requireRole('admin');
  const [branches, grades, check] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    supabase.from('grades').select('id, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.rpc('student_result_counts'), // يتأكد من تشغيل 0015
  ]);
  if (check.error) {
    return (
      <div className="card max-w-xl p-6 text-[14px] leading-7">
        <p className="font-semibold">دمج الأسماء غير مفعّل بعد</p>
        <p className="text-ink-muted">يلزم تشغيل ملف التحديث 0015 في Supabase ثم تحديث الصفحة.</p>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="دمج الأسماء المكررة" subtitle="يظهر الاسمان المتشابهان، وتنقلين رصد الاسم المكرر إلى الاسم الصحيح ثم يُحذف المكرر. كل دمج محفوظ ويمكن التراجع عنه" />
      <DuplicatesClient branches={branches.data ?? []} grades={grades.data ?? []} />
    </div>
  );
}
