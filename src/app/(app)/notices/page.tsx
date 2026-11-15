import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { NoticesClient, type NoticeSection } from './notices-client';

export const metadata = { title: 'إشعارات الدرجات' };

export default async function NoticesPage() {
  const { supabase, profile } = await requireRole('admin', 'supervisor', 'teacher');
  const settings = await getSettings();
  const [{ data: access, error }, { data: sections }] = await Promise.all([
    supabase.rpc('notice_has_access'),
    supabase.rpc('notice_sections'),
  ]);
  if (error) {
    return (
      <div className="card max-w-xl p-6 text-[14px] leading-7">
        <p className="font-semibold">لم تُفعَّل ميزة إشعارات الدرجات بعد</p>
        <p className="text-ink-muted">يلزم تشغيل ملف التحديث 0012 في Supabase ثم تحديث الصفحة.</p>
      </div>
    );
  }
  if (!access) redirect('/');
  return (
    <div>
      <PageHeader title="إشعارات الدرجات" subtitle="إصدار إشعار درجات الفصل لطالب واحد وتنزيله PDF أو صورة بجودة عالية" />
      <NoticesClient
        role={profile.role}
        sections={(sections ?? []) as NoticeSection[]}
        currentTerm={settings.current_term}
      />
    </div>
  );
}
