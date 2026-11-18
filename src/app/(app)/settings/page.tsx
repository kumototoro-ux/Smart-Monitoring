import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsForm } from './settings-form';
import { ConductSettings } from './conduct-settings';

export const metadata = { title: 'الإعدادات العامة' };

export default async function SettingsPage() {
  const { supabase } = await requireRole('admin');
  const settings = await getSettings();
  const cs = await supabase.from('settings').select('conduct_enabled, conduct_min_subjects').eq('id', 1).single();
  return (
    <div className="max-w-3xl">
      <PageHeader title="الإعدادات العامة" subtitle="فترة الرصد، الترم الحالي، ومدة التعديل" />
      <SettingsForm initial={settings} />
      <ConductSettings enabled={!!cs.data?.conduct_enabled} min={Number(cs.data?.conduct_min_subjects ?? 3)} migrated={!cs.error} />
    </div>
  );
}
