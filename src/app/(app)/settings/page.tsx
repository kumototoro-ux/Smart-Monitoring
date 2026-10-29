import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'الإعدادات العامة' };

export default async function SettingsPage() {
  await requireRole('admin');
  const settings = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="الإعدادات العامة" subtitle="فترة الرصد، الترم الحالي، ومدة التعديل" />
      <SettingsForm initial={settings} />
    </div>
  );
}
