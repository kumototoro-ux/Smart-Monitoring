import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { ROLE_LABEL } from '@/lib/types';
import { fmtDateTime } from '@/lib/utils';
import { PasswordForm } from './password-form';

export const metadata = { title: 'حسابي' };

export default async function AccountPage() {
  const { profile } = await requireRole();
  return (
    <div className="max-w-2xl">
      <PageHeader title="حسابي" />
      <div className="card mb-4 grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <Info label="الاسم" value={profile.full_name} />
        <Info label="اسم المستخدم" value={profile.username} ltr />
        <Info label="الصلاحية" value={ROLE_LABEL[profile.role]} />
        <Info label="آخر دخول" value={fmtDateTime(profile.last_login_at)} />
      </div>
      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-[17px] font-semibold">تغيير كلمة المرور</h2>
        <PasswordForm />
      </div>
    </div>
  );
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <p className="text-[12.5px] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-medium" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>{value}</p>
    </div>
  );
}
